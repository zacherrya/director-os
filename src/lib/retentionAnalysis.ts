/**
 * Reads a retention curve the way an experienced creator reads it, and says what
 * to change next time.
 *
 * The framework is the standard one: the first 30 seconds are the hook, the
 * middle is whether you delivered on the title, and the last stretch is whether
 * people felt satisfied. Three things about it are easy to get wrong and are
 * handled explicitly here:
 *
 * 1. **The first 15 seconds always collapse.** YouTube shows a video to a broad
 *    audience and most of them were never the audience. Flagging that drop would
 *    be flagging normal physics, so the hook is judged at the 30-second mark, not
 *    at the steepest point.
 * 2. **Late drops are not failures.** Someone who leaves at 85% got what they
 *    came for. Only drops before the satisfied zone are reported as problems.
 * 3. **A percentage means nothing without length.** 40% on a fifteen-minute video
 *    beats 60% on a three-minute one. Where YouTube gives us
 *    `relativeRetentionPerformance` — a percentile against videos of similar
 *    length — that is the honest benchmark and it leads.
 *
 * Everything is mapped back onto the episode's own scenes where one is linked,
 * because "you lose them 4:10 in" is a fact and "you lose them in your It Isn't
 * beat" is something you can act on.
 */

import type { Episode } from './types'
import type { RetentionCurve, RetentionPoint } from './youtubeAnalytics'

/** The hook window, for a video long enough to have one. */
export const HOOK_WINDOW_S = 30
/** Keeping less than this past the hook window means the intro is the problem. */
export const HOOK_HEALTHY = 0.6
/** Past this point through the video, leaving reads as satisfied rather than lost. */
export const SATISFIED_ZONE = 0.8
/** A single step has to shed this share of the remaining audience to count as a cliff. */
export const CLIFF_MIN_SHARE = 0.08
/** Below this many views the curve is mostly noise. */
export const CONFIDENT_VIEWS = 1000

export type FindingKind = 'hook' | 'cliff' | 'spike' | 'skip' | 'ending' | 'shape' | 'benchmark'
export type Severity = 'high' | 'medium' | 'good'

export interface SceneRef {
  id: string
  index: number
  purpose: string
}

export interface RetentionFinding {
  kind: FindingKind
  severity: Severity
  /** 0-1 through the video, when the finding is located somewhere specific. */
  position: number | null
  seconds: number | null
  title: string
  detail: string
  /** Phrased as an instruction, so it can go straight into the playbook. */
  fix: string | null
  scene?: SceneRef
}

export type CurveShape = 'healthy' | 'ski-slope' | 'early-cliff' | 'flat-tail' | 'unknown'

export interface RetentionReport {
  videoId: string
  title: string
  durationSeconds: number | null
  views: number | null
  /** Share still watching at the end of the hook window. */
  hookRetention: number | null
  /** Mean of the curve — the average share of the video watched. */
  averagePercentViewed: number | null
  /** Share still watching at the very end. */
  endingRetention: number | null
  shape: CurveShape
  /** 0-1 percentile against similar-length videos; 0.5 is the median. */
  relativePerformance: number | null
  /** Enough views for the curve to be more than noise. */
  confident: boolean
  points: RetentionPoint[]
  findings: RetentionFinding[]
  /** Scene boundaries as 0-1 positions, for drawing over the graph. */
  sceneMarks: { position: number; scene: SceneRef }[]
}

// --- curve helpers ----------------------------------------------------------

/** Light 3-point smoothing so single noisy samples don't read as cliffs. */
function smooth(points: RetentionPoint[]): number[] {
  return points.map((p, i) => {
    const prev = points[i - 1]?.watching ?? p.watching
    const next = points[i + 1]?.watching ?? p.watching
    return (prev + p.watching + next) / 3
  })
}

function valueAt(points: RetentionPoint[], position: number): number | null {
  if (points.length === 0) return null
  if (position <= points[0].position) return points[0].watching
  const last = points[points.length - 1]
  if (position >= last.position) return last.watching

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (position <= b.position) {
      const span = b.position - a.position
      if (span <= 0) return b.watching
      const t = (position - a.position) / span
      return a.watching + (b.watching - a.watching) * t
    }
  }
  return last.watching
}

/** The hook window as a fraction of this video — Shorts need a much tighter one. */
function hookWindowSeconds(duration: number | null): number {
  if (!duration || duration <= 0) return HOOK_WINDOW_S
  return Math.min(HOOK_WINDOW_S, Math.max(3, duration * 0.25))
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

/**
 * Locates a position in the *plan*, proportionally.
 *
 * Deliberately not matched on absolute seconds: the published cut almost never
 * matches the planned runtime to the second, and proportional mapping degrades
 * gracefully when it drifts. It does assume the edit followed the plan's order.
 */
function sceneAt(episode: Episode | undefined, position: number): SceneRef | undefined {
  if (!episode || episode.scenes.length === 0 || !episode.length) return undefined
  const planSeconds = position * episode.length
  const scene =
    episode.scenes.find((s) => planSeconds >= s.start && planSeconds < s.end) ??
    episode.scenes[episode.scenes.length - 1]
  return { id: scene.id, index: scene.index, purpose: scene.purpose }
}

// --- the findings -----------------------------------------------------------

interface Cliff {
  from: number
  to: number
  /** Share of the audience still watching that was lost across this stretch. */
  lost: number
}

/** Contiguous runs of steep loss, merged so one drop isn't reported three times. */
function findCliffs(points: RetentionPoint[], values: number[], startAt: number, endAt: number): Cliff[] {
  const cliffs: Cliff[] = []
  let run: Cliff | null = null

  for (let i = 1; i < points.length; i++) {
    const pos = points[i].position
    if (pos < startAt || pos > endAt) {
      if (run) {
        cliffs.push(run)
        run = null
      }
      continue
    }
    const before = values[i - 1]
    const after = values[i]
    const stepLoss = before > 0 ? (before - after) / before : 0

    if (stepLoss >= CLIFF_MIN_SHARE / 2) {
      if (run) run.to = pos
      else run = { from: points[i - 1].position, to: pos, lost: 0 }
    } else if (run) {
      cliffs.push(run)
      run = null
    }
  }
  if (run) cliffs.push(run)

  return cliffs
    .map((c) => {
      const a = valueAt(points, c.from) ?? 0
      const b = valueAt(points, c.to) ?? 0
      return { ...c, lost: a > 0 ? (a - b) / a : 0 }
    })
    .filter((c) => c.lost >= CLIFF_MIN_SHARE)
    .sort((x, y) => y.lost - x.lost)
}

/**
 * Points people rewatched — the ratio goes above 1 only when a segment is replayed.
 *
 * The opening couple of seconds are excluded. They almost always read as
 * "rewatched" because viewers restart a video, scrub back to the beginning, or
 * land on it twice; calling the first second of a Short someone's strongest
 * moment is an artefact dressed up as an insight.
 */
const RESTART_ARTEFACT_S = 3

function findSpikes(points: RetentionPoint[], durationSeconds: number | null): RetentionPoint[] {
  const floor = durationSeconds && durationSeconds > 0 ? RESTART_ARTEFACT_S / durationSeconds : 0.03
  points = points.filter((p) => p.position >= floor)
  const rewatched = points.filter((p) => p.watching > 1)
  if (rewatched.length > 0) {
    return [...rewatched].sort((a, b) => b.watching - a.watching).slice(0, 2)
  }
  // No outright rewatches: fall back to places the curve rose against its own
  // trend, which is the same behaviour at a smaller scale.
  const risers: RetentionPoint[] = []
  for (let i = 1; i < points.length - 1; i++) {
    const rise = points[i].watching - points[i - 1].watching
    if (rise > 0.02 && points[i].watching >= points[i + 1].watching) risers.push(points[i])
  }
  return risers.sort((a, b) => b.watching - a.watching).slice(0, 1)
}

function classifyShape(
  hookRetention: number | null,
  endingRetention: number | null,
  cliffs: Cliff[],
  points: RetentionPoint[],
): CurveShape {
  if (points.length < 5 || hookRetention === null || endingRetention === null) return 'unknown'
  if (cliffs.some((c) => c.from < 0.25 && c.lost >= 0.2)) return 'early-cliff'
  // A ski slope keeps shedding viewers at a constant rate and arrives nowhere.
  if (hookRetention >= HOOK_HEALTHY && endingRetention < 0.15 && cliffs.length === 0) return 'ski-slope'
  if (endingRetention >= 0.3) return 'flat-tail'
  return 'healthy'
}

export function analyzeRetention(
  curve: RetentionCurve,
  meta: { videoId: string; title: string; durationSeconds: number | null; views: number | null },
  episode?: Episode,
): RetentionReport {
  const points = curve.points
  const { videoId, title, durationSeconds, views } = meta
  const values = smooth(points)
  const findings: RetentionFinding[] = []

  const hookSeconds = hookWindowSeconds(durationSeconds)
  const hookPosition = durationSeconds && durationSeconds > 0 ? Math.min(1, hookSeconds / durationSeconds) : 0.05
  const hookRetention = valueAt(points, hookPosition)
  const endingRetention = points.length > 0 ? points[points.length - 1].watching : null
  const averagePercentViewed =
    points.length > 0 ? points.reduce((n, p) => n + Math.min(1, p.watching), 0) / points.length : null

  // Start hunting cliffs a little past the hook window, not at its edge. The
  // intro's decay is still in progress at that boundary, and catching its tail
  // would report the same drop twice — once as a weak hook and again as a cliff
  // "0-10% in", which is exactly the normal physics this module refuses to flag.
  const cliffStart = Math.min(SATISFIED_ZONE, hookPosition * 1.2 + 0.02)
  const cliffs = findCliffs(points, values, cliffStart, SATISFIED_ZONE)
  const shape = classifyShape(hookRetention, endingRetention, cliffs, points)
  const confident = views === null || views >= CONFIDENT_VIEWS
  const seconds = (position: number) => (durationSeconds ? position * durationSeconds : null)

  // 1. The hook.
  if (hookRetention !== null) {
    if (hookRetention < HOOK_HEALTHY) {
      findings.push({
        kind: 'hook',
        severity: 'high',
        position: hookPosition,
        seconds: hookSeconds,
        title: `Only ${pct(hookRetention)} reach ${formatTime(hookSeconds)}`,
        detail:
          `Losing the first chunk is normal — YouTube shows a video to people who were never going to stay. ` +
          `But past ${formatTime(hookSeconds)} you are looking at people who chose this video, and most of them are still leaving.`,
        fix: 'Open on the promise itself. Cut any setup, branding or throat-clearing before the first payoff.',
        scene: sceneAt(episode, hookPosition * 0.5),
      })
    } else {
      findings.push({
        kind: 'hook',
        severity: 'good',
        position: hookPosition,
        seconds: hookSeconds,
        title: `${pct(hookRetention)} still watching at ${formatTime(hookSeconds)}`,
        detail: 'The hook is doing its job — the people who chose this video are staying past the filter.',
        fix: null,
        scene: sceneAt(episode, hookPosition * 0.5),
      })
    }
  }

  // 2. Cliffs, in the stretch where leaving is a problem rather than satisfaction.
  // Ranked, because only one drop can be the worst one — two findings both
  // claiming to lose "most" of the audience just reads as boilerplate.
  cliffs.slice(0, 3).forEach((cliff, rank) => {
    const at = (cliff.from + cliff.to) / 2
    const scene = sceneAt(episode, at)
    findings.push({
      kind: 'cliff',
      severity: cliff.lost >= 0.2 ? 'high' : 'medium',
      position: at,
      seconds: seconds(at),
      title: scene
        ? `${pct(cliff.lost)} walk out in scene ${scene.index} · ${scene.purpose}`
        : `${pct(cliff.lost)} walk out around ${seconds(at) === null ? pct(at) : formatTime(seconds(at)!)}`,
      detail:
        `A drop this steep in one stretch is a specific moment failing, not general drift. ` +
        `Watch from ${seconds(cliff.from) === null ? pct(cliff.from) : formatTime(seconds(cliff.from)!)} and find what changes.`,
      fix: scene
        ? rank === 0
          ? `Tighten scene ${scene.index} (${scene.purpose}) — it is where this video loses most of its audience.`
          : `Scene ${scene.index} (${scene.purpose}) is the next-biggest leak. Cut it back once the bigger drop is fixed.`
        : rank === 0
          ? 'Tighten the stretch where the drop starts — usually a tangent, a slow explanation, or dead air.'
          : 'Another stretch worth tightening once the bigger drop is dealt with.',
      scene,
    })
  })

  // 3. Rewatched moments — the parts worth making more of.
  for (const spike of findSpikes(points, durationSeconds)) {
    const scene = sceneAt(episode, spike.position)
    findings.push({
      kind: 'spike',
      severity: 'good',
      position: spike.position,
      seconds: seconds(spike.position),
      title:
        spike.watching > 1
          ? `Rewatched at ${seconds(spike.position) === null ? pct(spike.position) : formatTime(seconds(spike.position)!)}`
          : `Attention climbs at ${seconds(spike.position) === null ? pct(spike.position) : formatTime(seconds(spike.position)!)}`,
      detail:
        spike.watching > 1
          ? 'The curve goes above 100% here, which only happens when people rewind and watch a segment again. This is your strongest moment.'
          : 'The curve rises against its own trend here — something pulled drifting viewers back in.',
      fix: scene
        ? `Make more of what scene ${scene.index} (${scene.purpose}) does — it is the part people replay.`
        : 'Lead with this kind of moment, and put more of it earlier.',
      scene,
    })
  }

  // 4. The ending.
  if (endingRetention !== null && confident) {
    if (endingRetention >= 0.3) {
      findings.push({
        kind: 'ending',
        severity: 'good',
        position: 1,
        seconds: durationSeconds,
        title: `${pct(endingRetention)} watch to the end`,
        detail: 'A strong finish is one of the clearest quality signals YouTube has, and it feeds straight back into how far the video travels.',
        fix: null,
      })
    } else if (endingRetention < 0.1 && shape !== 'early-cliff') {
      findings.push({
        kind: 'ending',
        severity: 'medium',
        position: 1,
        seconds: durationSeconds,
        title: `Almost nobody reaches the end (${pct(endingRetention)})`,
        detail: 'The last stretch is not earning its length. Either the payoff lands too early or the ending outstays it.',
        fix: 'End sooner, or move a real payoff into the final stretch so there is a reason to stay for it.',
      })
    }
  }

  // 5. Shape, when it says something the individual findings don't.
  if (shape === 'ski-slope') {
    findings.push({
      kind: 'shape',
      severity: 'high',
      position: null,
      seconds: null,
      title: 'Steady bleed rather than a specific problem',
      detail:
        'There is no single cliff here — viewers leave at a constant rate the whole way through. That points at pacing across the whole video rather than one bad moment.',
      fix: 'Add a reason to keep watching every couple of minutes — tease what is coming before the current point resolves.',
    })
  }

  // 6. The benchmark that actually controls for length.
  if (curve.relativePerformance !== null) {
    const p = curve.relativePerformance
    findings.push({
      kind: 'benchmark',
      severity: p >= 0.5 ? 'good' : 'medium',
      position: null,
      seconds: null,
      title: `Holds viewers better than ${pct(p)} of similar-length videos`,
      detail:
        p >= 0.5
          ? 'This is the benchmark worth trusting — it compares against videos of the same length rather than an arbitrary target, and YouTube weighs it when deciding how far to push a video.'
          : 'Against videos of the same length this one is in the bottom half. Absolute percentages flatter short videos and punish long ones; this number does not.',
      fix: null,
    })
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, good: 2 }
  findings.sort((a, b) => order[a.severity] - order[b.severity])

  const sceneMarks =
    episode && episode.length
      ? episode.scenes.map((s) => ({
          position: s.start / episode.length,
          scene: { id: s.id, index: s.index, purpose: s.purpose },
        }))
      : []

  return {
    videoId,
    title,
    durationSeconds,
    views,
    hookRetention,
    averagePercentViewed,
    endingRetention,
    shape,
    relativePerformance: curve.relativePerformance,
    confident,
    points,
    findings,
    sceneMarks,
  }
}

// --- across the whole channel ----------------------------------------------

export interface RetentionPattern {
  /** Where in the video, 0-1. */
  position: number
  /** How many of the audited videos drop hard around here. */
  videos: number
  /** Present when the drops keep landing on the same kind of beat. */
  scenePurpose: string | null
  detail: string
  fix: string
}

/** Below this many audited videos, a "pattern" is a coincidence. */
export const MIN_VIDEOS_FOR_PATTERN = 4
/** A drop position has to recur in at least this share of videos to be a pattern. */
const PATTERN_SHARE = 0.5

/**
 * The cross-video audit: not "this video drops at 4:10" but "you lose people in
 * the same place every time", which is the finding that changes how you write
 * the next one rather than how you re-edit the last one.
 */
export function findRetentionPatterns(reports: RetentionReport[]): RetentionPattern[] {
  const usable = reports.filter((r) => r.confident && r.points.length > 0)
  if (usable.length < MIN_VIDEOS_FOR_PATTERN) return []

  // Bucket every cliff into tenths of a video and look for recurrence.
  const buckets = new Map<number, { count: number; purposes: string[] }>()
  for (const report of usable) {
    const seen = new Set<number>()
    for (const f of report.findings) {
      if (f.kind !== 'cliff' || f.position === null) continue
      const bucket = Math.floor(f.position * 10)
      if (seen.has(bucket)) continue
      seen.add(bucket)
      const entry = buckets.get(bucket) ?? { count: 0, purposes: [] }
      entry.count++
      if (f.scene) entry.purposes.push(f.scene.purpose)
      buckets.set(bucket, entry)
    }
  }

  const patterns: RetentionPattern[] = []
  for (const [bucket, entry] of buckets) {
    if (entry.count / usable.length < PATTERN_SHARE || entry.count < 2) continue

    // Does it also keep landing on the same kind of beat?
    const tally = new Map<string, number>()
    for (const p of entry.purposes) tally.set(p, (tally.get(p) ?? 0) + 1)
    const [topPurpose, topCount] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    const scenePurpose = topPurpose && topCount >= Math.ceil(entry.count / 2) ? topPurpose : null

    const from = bucket * 10
    patterns.push({
      position: bucket / 10,
      videos: entry.count,
      scenePurpose,
      detail: scenePurpose
        ? `${entry.count} of your ${usable.length} audited videos lose viewers sharply around ${from}–${from + 10}% in, and it keeps happening on a ${scenePurpose} beat.`
        : `${entry.count} of your ${usable.length} audited videos lose viewers sharply around ${from}–${from + 10}% in.`,
      fix: scenePurpose
        ? `Your ${scenePurpose} beats are where viewers leave. Cut them shorter, or move the payoff in front of them.`
        : `Put a reason to keep watching just before the ${from}% mark — that is where you keep losing people.`,
    })
  }

  return patterns.sort((a, b) => b.videos - a.videos)
}

/**
 * The part of a retention report worth keeping between sessions.
 *
 * Deliberately not the curve itself: ten videos of 101 points each is a lot of
 * localStorage for something only ever redrawn from a fresh fetch. What the
 * draft check needs is the shape of the habit — where you lose people and which
 * beat it lands on — and that compresses to a few numbers per video.
 */
export interface RetentionSnapshot {
  videoId: string
  title: string
  durationSeconds: number | null
  hookRetention: number | null
  averagePercentViewed: number | null
  endingRetention: number | null
  relativePerformance: number | null
  confident: boolean
  /** Every drop-off this video had, with the beat it landed on when known. */
  cliffs: { position: number; scenePurpose: string | null }[]
  fetchedAt: string
}

export function toSnapshot(report: RetentionReport): RetentionSnapshot {
  return {
    videoId: report.videoId,
    title: report.title,
    durationSeconds: report.durationSeconds,
    hookRetention: report.hookRetention,
    averagePercentViewed: report.averagePercentViewed,
    endingRetention: report.endingRetention,
    relativePerformance: report.relativePerformance,
    confident: report.confident,
    cliffs: report.findings
      .filter((f) => f.kind === 'cliff' && f.position !== null)
      .map((f) => ({ position: f.position!, scenePurpose: f.scene?.purpose ?? null })),
    fetchedAt: new Date().toISOString(),
  }
}
