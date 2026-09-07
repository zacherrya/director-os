/**
 * Reads a draft episode and flags what is likely to cost it viewers — while the
 * draft is still cheap to change.
 *
 * Two tiers, deliberately separated:
 *
 *  - `craft` checks encode short-form fundamentals and run against any draft,
 *    including the very first one. They are the reason this is useful on day one.
 *  - `history` checks compare the draft with the creator's own published results.
 *    They are the reason it gets sharper, and they refuse to run below
 *    MIN_HISTORY linked posts — a "benchmark" drawn from two videos is a
 *    coin flip wearing a lab coat, and acting on it would be worse than
 *    having no check at all.
 *
 * Nothing here predicts views. Every finding names a concrete thing to change.
 */

import type { Episode, PlaybookRule, Scene } from './types'
import { engagementRate, PLATFORM_LABEL, type PostPerformance, type SocialPlatform } from './social'
import { diagnoseExit } from './retention'
import { HOOK_HEALTHY, type RetentionSnapshot } from './retentionAnalysis'
import { checkPlaybook } from './playbook'
import { DEFAULT_SPEAKING_PACE, PACE_WORDS_PER_SECOND } from './types'

/** Below this many linked posts, history comparisons stay silent. */
export const MIN_HISTORY = 3

export type FindingSeverity = 'flag' | 'note' | 'good'

export interface DraftFinding {
  id: string
  severity: FindingSeverity
  title: string
  detail: string
  /** Scene the finding is about, for jump-to. */
  sceneId?: string
  source: 'craft' | 'history' | 'playbook' | 'retention' | 'posts'
  /**
   * Which account this was learned from. Absent for craft rules and playbook
   * rules, which are about the video itself rather than where it goes.
   */
  platform?: SocialPlatform
}

export interface LinkedPost {
  episode: Episode
  post: PostPerformance
}

/** Joins published posts back to the episodes they were planned from. */
export function buildHistory(episodes: Episode[], posts: PostPerformance[]): LinkedPost[] {
  const out: LinkedPost[] = []
  for (const post of posts) {
    const episode = episodes.find((e) =>
      post.platform === 'instagram' ? e.instagramMediaId === post.id : e.youtubeVideoId === post.id,
    )
    if (episode && !episode.deletedAt) out.push({ episode, post })
  }
  return out
}

function wordCount(text: string): number {
  const t = text.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

/** The better-performing half of the creator's linked posts, by engagement rate. */
function topHalf(history: LinkedPost[]): LinkedPost[] {
  const scored = history
    .map((h) => ({ h, rate: engagementRate(h.post) }))
    .filter((x): x is { h: LinkedPost; rate: number } => x.rate !== null)
    .sort((a, b) => b.rate - a.rate)
  if (scored.length === 0) return []
  return scored.slice(0, Math.max(1, Math.ceil(scored.length / 2))).map((x) => x.h)
}

function hookOf(episode: Episode): Scene | undefined {
  return episode.scenes.find((s) => s.purpose === 'Hook') ?? episode.scenes[0]
}

// ---------------------------------------------------------------- craft checks

function craftChecks(episode: Episode): DraftFinding[] {
  const out: DraftFinding[] = []
  const scenes = episode.scenes
  if (scenes.length === 0) return out

  const hook = hookOf(episode)
  const pace = episode.defaultPace ?? DEFAULT_SPEAKING_PACE

  if (!scenes.some((s) => s.purpose === 'Hook')) {
    out.push({
      id: 'no-hook',
      severity: 'flag',
      title: 'No Hook beat',
      detail: 'Nothing in this draft is marked as the Hook. The opening seconds decide how far the video travels — label the beat that has to earn attention.',
      sceneId: scenes[0].id,
      source: 'craft',
    })
  }

  if (hook) {
    const hookLength = hook.end - hook.start
    if (hookLength > 3) {
      out.push({
        id: 'hook-long',
        severity: 'flag',
        title: `Hook runs ${hookLength}s`,
        detail: 'Short-form viewers decide inside about three seconds. Either tighten this to land its promise sooner, or split the payoff earlier into the beat.',
        sceneId: hook.id,
        source: 'craft',
      })
    }
    if (wordCount(hook.dialogue) === 0) {
      out.push({
        id: 'hook-empty',
        severity: 'flag',
        title: 'Hook has no line yet',
        detail: 'The opening line is the single highest-leverage sentence in the video. Write it before anything else.',
        sceneId: hook.id,
        source: 'craft',
      })
    }
  }

  // Scenes whose dialogue does not fit the time allowed at the chosen pace.
  const wps = PACE_WORDS_PER_SECOND[pace]
  for (const s of scenes) {
    const words = wordCount(s.dialogue)
    if (words === 0) continue
    const duration = s.end - s.start
    const needed = words / wps
    if (needed > duration * 1.25) {
      out.push({
        id: `crammed-${s.id}`,
        severity: 'flag',
        title: `Scene ${s.index} is over-stuffed`,
        detail: `${words} words needs about ${needed.toFixed(1)}s at ${pace} pace, but the scene is ${duration}s. You'll either rush it or run long — cut words or give it more time.`,
        sceneId: s.id,
        source: 'craft',
      })
    } else if (needed < duration * 0.5 && duration > 2) {
      out.push({
        id: `slack-${s.id}`,
        severity: 'note',
        title: `Scene ${s.index} has dead air`,
        detail: `${words} words fills roughly ${needed.toFixed(1)}s of a ${duration}s scene. Either tighten the scene or make the silence deliberate with a visual beat.`,
        sceneId: s.id,
        source: 'craft',
      })
    }
  }

  const silent = scenes.filter((s) => wordCount(s.dialogue) === 0 && s.visual.trim() === '')
  if (silent.length > 0) {
    out.push({
      id: 'empty-scenes',
      severity: 'note',
      title: `${silent.length} scene${silent.length === 1 ? ' has' : 's have'} no line and no visual`,
      detail: 'These will be hard to shoot as planned. Give each one either a line or a description of what the viewer sees.',
      sceneId: silent[0].id,
      source: 'craft',
    })
  }

  // On-screen text that outlives the scene holding it.
  for (const s of scenes) {
    const duration = s.end - s.start
    if (s.onScreenText.text.trim() !== '' && s.onScreenText.duration > duration) {
      out.push({
        id: `text-overrun-${s.id}`,
        severity: 'note',
        title: `Scene ${s.index} text outlasts the scene`,
        detail: `The overlay is set to ${s.onScreenText.duration}s inside a ${duration}s scene, so it will be cut off or spill into the next shot.`,
        sceneId: s.id,
        source: 'craft',
      })
    }
  }

  const endsWell = ['CTA', 'Teaser', 'Homework'].includes(scenes[scenes.length - 1].purpose)
  if (!endsWell && scenes.length > 2) {
    out.push({
      id: 'no-ending',
      severity: 'note',
      title: 'No CTA, Teaser or Homework at the end',
      detail: `This ends on ${scenes[scenes.length - 1].purpose}. Giving the viewer somewhere to go is what converts a view into a follow or a rewatch.`,
      sceneId: scenes[scenes.length - 1].id,
      source: 'craft',
    })
  }

  return out
}

// -------------------------------------------------------------- history checks

/**
 * Runs the history comparisons separately for each platform.
 *
 * Pooling them was wrong: a Reel's engagement rate and a YouTube video's are not
 * the same measurement, and their working runtimes differ by an order of
 * magnitude. A median across both describes no account that actually exists.
 */
function historyChecks(episode: Episode, history: LinkedPost[]): DraftFinding[] {
  const platforms: SocialPlatform[] = ['instagram', 'youtube']
  return platforms.flatMap((platform) =>
    historyChecksFor(episode, history.filter((h) => h.post.platform === platform), platform),
  )
}

function historyChecksFor(
  episode: Episode,
  history: LinkedPost[],
  platform: SocialPlatform,
): DraftFinding[] {
  const out: DraftFinding[] = []
  if (history.length < MIN_HISTORY) return out
  const where = PLATFORM_LABEL[platform]

  const best = topHalf(history)
  const hook = hookOf(episode)

  // Runtime against the runtimes that actually performed.
  const bestLengths = best.map((h) => h.episode.length).filter((n) => n > 0)
  const bestMedianLength = median(bestLengths)
  if (bestMedianLength !== null && episode.length > bestMedianLength * 1.25) {
    out.push({
      id: `longer-than-winners-${platform}`,
      severity: 'flag',
      title: `Longer than your better ${where} posts`,
      detail: `This draft is ${episode.length}s. The better half of your linked ${where} posts sit around ${bestMedianLength.toFixed(0)}s. Longer isn't automatically worse, but it needs to earn the extra time.`,
      source: 'history',
      platform,
    })
  }

  // Hook length against the hooks that performed.
  const bestHookLengths = best
    .map((h) => {
      const bh = hookOf(h.episode)
      return bh ? bh.end - bh.start : null
    })
    .filter((n): n is number => n !== null)
  const bestMedianHook = median(bestHookLengths)
  if (hook && bestMedianHook !== null) {
    const thisHook = hook.end - hook.start
    if (thisHook > bestMedianHook + 1) {
      out.push({
        id: `hook-longer-than-winners-${platform}`,
        severity: 'flag',
        title: `Hook is slower than your best ${where} openings`,
        detail: `This hook runs ${thisHook}s; your better-performing ${where} posts open in about ${bestMedianHook.toFixed(1)}s.`,
        sceneId: hook.id,
        source: 'history',
        platform,
      })
    }
  }

  // Where viewers have historically left, mapped onto this draft's timeline.
  const exitTimes = history
    .filter((h) => diagnoseExit(h.post.avgWatchTime, h.episode)?.watchedToEnd === false)
    .map((h) => h.post.avgWatchTime)
    .filter((n): n is number => n !== null)

  if (exitTimes.length >= 2) {
    const typicalExit = median(exitTimes)
    const sceneAtRisk =
      typicalExit === null ? undefined : episode.scenes.find((s) => typicalExit >= s.start && typicalExit < s.end)
    if (typicalExit !== null && sceneAtRisk) {
      out.push({
        id: `historic-exit-point-${platform}`,
        severity: 'note',
        title: `Your ${where} viewers usually leave around ${typicalExit.toFixed(1)}s`,
        detail: `In this draft that lands in scene ${sceneAtRisk.index} · ${sceneAtRisk.purpose}. Make sure something lands right before it — a turn, a payoff, or a reason to stay.`,
        sceneId: sceneAtRisk.id,
        source: 'history',
        platform,
      })
    }
  }

  // Beat structures that have actually worked.
  const beatKey = (e: Episode) => e.scenes.map((s) => s.purpose).join(' → ')
  const thisKey = beatKey(episode)
  const matching = history.filter((h) => beatKey(h.episode) === thisKey)
  if (matching.length >= 2) {
    const rates = matching.map((h) => engagementRate(h.post)).filter((r): r is number => r !== null)
    const avg = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null
    const allRates = history.map((h) => engagementRate(h.post)).filter((r): r is number => r !== null)
    const overall = allRates.length > 0 ? allRates.reduce((a, b) => a + b, 0) / allRates.length : null
    if (avg !== null && overall !== null) {
      const better = avg >= overall
      out.push({
        id: `beat-structure-record-${platform}`,
        severity: better ? 'good' : 'note',
        title: better
          ? `This structure has worked on ${where}`
          : `This structure has underperformed on ${where}`,
        detail: `You've published ${matching.length} ${where} posts with this exact beat order, averaging ${avg.toFixed(1)}% engagement against your ${overall.toFixed(1)}% overall there.`,
        source: 'history',
        platform,
      })
    }
  }

  return out
}

// ------------------------------------------------------- unlinked-post checks

/** Enough published posts for a runtime comparison, linked or not. */
export const MIN_POSTS_FOR_RUNTIME = 4

/**
 * The checks that need published results but *not* the episode link.
 *
 * Linking a post to an episode is what unlocks the sharp comparisons — beat
 * structure, hook length, where viewers left — because those need to know what
 * the video was made of. Runtime doesn't: the platform reports a duration for
 * every video whether or not we know its plan. So this runs on day one, off the
 * posts already fetched, instead of waiting for a chore to be done.
 *
 * In practice this is YouTube-only: Instagram's API reports no duration for
 * Reels, so the platform loop finds nothing to compare there. That falls out of
 * the data rather than being special-cased, so it starts working on its own if
 * Meta ever begins reporting it.
 */
function unlinkedChecks(episode: Episode, posts: PostPerformance[]): DraftFinding[] {
  const out: DraftFinding[] = []
  const platforms: SocialPlatform[] = ['instagram', 'youtube']

  for (const platform of platforms) {
    const withDuration = posts.filter(
      (p) => p.platform === platform && typeof p.duration === 'number' && p.duration > 0,
    )
    if (withDuration.length < MIN_POSTS_FOR_RUNTIME) continue

    const scored = withDuration
      .map((p) => ({ p, views: p.views }))
      .filter((x): x is { p: PostPerformance; views: number } => x.views !== null)
    if (scored.length < MIN_POSTS_FOR_RUNTIME) continue

    const medianViews = median(scored.map((x) => x.views))
    if (medianViews === null) continue

    const winners = scored.filter((x) => x.views >= medianViews).map((x) => x.p.duration as number)
    const winnerMedian = median(winners)
    if (winnerMedian === null || winnerMedian <= 0) continue

    const where = PLATFORM_LABEL[platform]
    const ratio = episode.length / winnerMedian

    if (ratio >= 1.4) {
      out.push({
        id: `unlinked-longer-${platform}`,
        severity: 'note',
        title: `Longer than your better ${where} videos`,
        detail: `This draft is ${episode.length}s. The better-performing half of your ${withDuration.length} recent ${where} videos run about ${Math.round(winnerMedian)}s. Longer can work, but the extra time has to earn itself.`,
        source: 'posts',
        platform,
      })
    } else if (ratio <= 0.6) {
      out.push({
        id: `unlinked-shorter-${platform}`,
        severity: 'note',
        title: `Shorter than your better ${where} videos`,
        detail: `This draft is ${episode.length}s against about ${Math.round(winnerMedian)}s for the better-performing half of your recent ${where} videos. Worth checking you are not cutting the part that made those work.`,
        source: 'posts',
        platform,
      })
    }
  }

  return out
}

// ------------------------------------------------------------ retention checks

/** Below this many videos with usable curves, a retention habit is a coincidence. */
export const MIN_RETENTION_VIDEOS = 3
/** A beat has to be where you lose people in this share of videos to count. */
const RECURRING_SHARE = 0.5

/**
 * Turns the retention curves into instructions for the draft in front of you.
 *
 * This is the one place the app can say "you do this every time" rather than
 * "this video did this" — so it only speaks when the same thing has happened
 * across several videos with enough views to be real. YouTube-only: Instagram
 * exposes no retention curve at any tier.
 */
function retentionChecks(episode: Episode, snapshots: RetentionSnapshot[]): DraftFinding[] {
  const out: DraftFinding[] = []
  const usable = snapshots.filter((s) => s.confident)
  if (usable.length < MIN_RETENTION_VIDEOS) return out

  const hook = hookOf(episode)
  const scenes = episode.scenes

  // 1. Do your hooks hold, historically?
  const hookRates = usable.map((s) => s.hookRetention).filter((v): v is number => v !== null)
  const medianHook = median(hookRates)
  if (medianHook !== null && medianHook < HOOK_HEALTHY && hook) {
    const lost = Math.round((1 - medianHook) * 100)
    out.push({
      id: 'retention-weak-hooks',
      severity: 'flag',
      title: `Your openings lose ${lost}% before the video gets going`,
      detail: `Across ${usable.length} videos with enough data, a median of only ${Math.round(medianHook * 100)}% are still watching once the early browsers have filtered out. That is a pattern in how you open, not bad luck on one video.`,
      sceneId: hook.id,
      source: 'retention',
      platform: 'youtube',
    })
  }

  // 2. Is there a beat you keep losing people on?
  const tally = new Map<string, number>()
  for (const snap of usable) {
    // One vote per video per beat, so a video with two cliffs on the same beat
    // doesn't count twice.
    const seen = new Set<string>()
    for (const c of snap.cliffs) {
      if (!c.scenePurpose || seen.has(c.scenePurpose)) continue
      seen.add(c.scenePurpose)
      tally.set(c.scenePurpose, (tally.get(c.scenePurpose) ?? 0) + 1)
    }
  }
  const recurring = [...tally.entries()]
    .filter(([, n]) => n >= 2 && n / usable.length >= RECURRING_SHARE)
    .sort((a, b) => b[1] - a[1])

  for (const [purpose, count] of recurring.slice(0, 2)) {
    const inDraft = scenes.filter((sc) => sc.purpose === purpose)
    if (inDraft.length === 0) continue
    const longest = inDraft.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a))
    out.push({
      id: `retention-recurring-${purpose}`,
      severity: 'flag',
      title: `${purpose} beats are where you lose viewers`,
      detail: `${count} of your ${usable.length} measured videos drop sharply on a ${purpose} beat. This draft has ${inDraft.length === 1 ? 'one' : `${inDraft.length}`}, the longest running ${longest.end - longest.start}s.`,
      sceneId: longest.id,
      source: 'retention',
      platform: 'youtube',
    })
  }

  // 3. Are your endings worth their runtime?
  const endings = usable.map((s) => s.endingRetention).filter((v): v is number => v !== null)
  const medianEnding = median(endings)
  const lastScene = scenes[scenes.length - 1]
  if (medianEnding !== null && medianEnding < 0.15 && lastScene && episode.length > 0) {
    const tailSeconds = lastScene.end - lastScene.start
    const tailShare = tailSeconds / episode.length
    if (tailShare > 0.15) {
      out.push({
        id: 'retention-thin-endings',
        severity: 'note',
        title: 'Almost nobody reaches your endings',
        detail: `A median of ${Math.round(medianEnding * 100)}% reach the end of your measured videos, yet this draft spends ${tailSeconds}s — ${Math.round(tailShare * 100)}% of its runtime — on a closing ${lastScene.purpose} beat. Either shorten it or move something worth staying for into it.`,
        sceneId: lastScene.id,
        source: 'retention',
        platform: 'youtube',
      })
    }
  }

  return out
}

export interface PlatformHistory {
  platform: SocialPlatform
  size: number
  ready: boolean
}

export interface DraftCheckResult {
  findings: DraftFinding[]
  historySize: number
  historyReady: boolean
  /** Linked-post counts per platform, so the UI can say which one is still thin. */
  historyByPlatform: PlatformHistory[]
  /** Videos with a usable retention curve behind the retention findings. */
  retentionSize: number
  rulesApplied: number
}

/** `rules` should already be filtered to those applying to this episode's project. */
export function runDraftCheck(
  episode: Episode,
  history: LinkedPost[],
  rules: PlaybookRule[] = [],
  retention: RetentionSnapshot[] = [],
  posts: PostPerformance[] = [],
): DraftCheckResult {
  const linkedChecks = historyChecks(episode, history)

  // The unlinked runtime check is a weaker version of the linked one. Where the
  // real comparison is available for a platform, this would just say the same
  // thing less precisely.
  const coveredPlatforms = new Set(linkedChecks.map((f) => f.platform))
  const findings = [
    ...checkPlaybook(episode, rules),
    ...craftChecks(episode),
    ...linkedChecks,
    ...unlinkedChecks(episode, posts).filter((f) => !coveredPlatforms.has(f.platform)),
    ...retentionChecks(episode, retention),
  ]

  // Severity first, then the creator's own rules ahead of generic craft advice
  // at equal severity — their earned lessons should read before our defaults.
  const severityOrder: Record<FindingSeverity, number> = { flag: 0, note: 1, good: 2 }
  // Retention sits just behind the playbook: it is the creator's own measured
  // behaviour across several videos, which outranks a single-platform average
  // and certainly outranks a generic craft rule.
  const sourceOrder: Record<DraftFinding['source'], number> = {
    playbook: 0,
    retention: 1,
    history: 2,
    posts: 3,
    craft: 4,
  }
  findings.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || sourceOrder[a.source] - sourceOrder[b.source],
  )

  const platforms: SocialPlatform[] = ['instagram', 'youtube']
  const historyByPlatform = platforms.map((platform) => {
    const size = history.filter((h) => h.post.platform === platform).length
    return { platform, size, ready: size >= MIN_HISTORY }
  })

  return {
    findings,
    historySize: history.length,
    historyReady: historyByPlatform.some((p) => p.ready),
    historyByPlatform,
    retentionSize: retention.filter((r) => r.confident).length,
    rulesApplied: rules.length,
  }
}
