/**
 * What the cut itself gets wrong — the things the draft check cannot see,
 * because the draft check reads a script and a script has no cuts, no caption
 * timings and no transitions.
 *
 * Two kinds of finding live here. Some are Zack's own craft rules, applied to
 * real timings: the half-second audit, masked jump cuts, entrances that snap,
 * one flash per video. Others hold the cut to its own plan — beats that ran long
 * against the script, beats with no footage. The measured findings (retention,
 * post history, the playbook) come from running the existing draft check against
 * `episodeAsCut`, and are merged alongside these in the panel rather than
 * duplicated here.
 *
 * Every fix is a pure function of the project, so applying one is an ordinary
 * edit that undo can take back.
 */

import type { Episode } from '../types.ts'
import {
  cutMarkers,
  layout,
  matchClipsToBeats,
  totalDuration,
  updateClip,
  updateText,
  type EditProject,
} from './model.ts'
import { textAnimation, tokenize } from './presets.ts'

export type InsightSeverity = 'flag' | 'note' | 'good'

export interface EditInsight {
  id: string
  severity: InsightSeverity
  title: string
  detail: string
  /** Timeline seconds, for jump-to. */
  at?: number
  sceneId?: string
  fix?: { label: string; apply: (p: EditProject) => EditProject }
}

/** The house budget: one thing starting, plus its own accent, per half-second. */
export const AUDIT_WINDOW = 0.5
export const AUDIT_LIMIT = 2
/** Nothing readable by this point and the sound-off viewer is already deciding. */
export const HOOK_TEXT_BY = 0.5
/** A join that removed less than this was a pause doing work — merge it back. */
export const MERGE_BELOW = 0.12
/** A join that removed up to this much is a jump cut the eye will catch. */
export const JUMP_CUT_UP_TO = 2
/** House range for a punch-in that masks a jump cut: 110–120%. */
export const PUNCH_IN = 1.12
/** Stagger applied when a crowded half-second is spread out. */
export const STAGGER = 0.25

const fmt = (s: number) => `${s.toFixed(1)}s`

interface Beat {
  at: number
  what: string
}

/** Everything that starts moving: cuts, transitions, and text arriving or leaving. */
export function motionEvents(p: EditProject): Beat[] {
  const events: Beat[] = []
  for (const c of layout(p.clips).slice(1)) {
    events.push({ at: c.transition?.start ?? c.start, what: c.transition ? 'a transition' : 'a cut' })
  }
  for (const t of p.texts) {
    const anim = textAnimation(t.animation)
    events.push({ at: t.start, what: 'text arriving' })
    if (t.duration > anim.enter + anim.exit + 0.1) events.push({ at: t.start + t.duration - anim.exit, what: 'text leaving' })
  }
  return events.sort((a, b) => a.at - b.at)
}

/** Half-second windows holding more than the budget, merged where they overlap. */
export function crowdedMoments(p: EditProject): { start: number; end: number; events: Beat[] }[] {
  const events = motionEvents(p)
  const crowded: { start: number; end: number; events: Beat[] }[] = []
  for (let i = 0; i < events.length; i++) {
    const inWindow = events.filter((e) => e.at >= events[i].at && e.at < events[i].at + AUDIT_WINDOW)
    if (inWindow.length <= AUDIT_LIMIT) continue
    const last = crowded[crowded.length - 1]
    if (last && events[i].at < last.end) {
      last.end = Math.max(last.end, events[i].at + AUDIT_WINDOW)
      for (const e of inWindow) if (!last.events.includes(e)) last.events.push(e)
    } else {
      crowded.push({ start: events[i].at, end: events[i].at + AUDIT_WINDOW, events: inWindow })
    }
  }
  return crowded
}

/** Pushes texts that start inside a crowded window so each follows the last by `STAGGER`. */
function staggerWindow(p: EditProject, start: number, end: number): EditProject {
  const inside = p.texts.filter((t) => t.start >= start && t.start < end).sort((a, b) => a.start - b.start)
  const anchors = motionEvents(p)
    .filter((e) => e.what !== 'text arriving' && e.at >= start && e.at < end)
    .map((e) => e.at)
  let cursor = anchors.length ? Math.min(...anchors) : start - STAGGER
  let next = p
  for (const text of inside) {
    const target = Math.max(text.start, cursor + STAGGER)
    if (target !== text.start) next = updateText(next, text.id, { start: target })
    cursor = target
  }
  return next
}

/** How long a caption must stay up to arrive, be read, and leave. */
export function readableDuration(text: string, animationId: Parameters<typeof textAnimation>[0]): number {
  const anim = textAnimation(animationId)
  const words = tokenize(text).length
  return anim.enter + anim.exit + Math.max(0.6, words * 0.3)
}

export function analyzeEdit(p: EditProject, episode?: Pick<Episode, 'scenes' | 'length'>): EditInsight[] {
  const out: EditInsight[] = []
  const placed = layout(p.clips)
  if (placed.length === 0) return out
  const runtime = totalDuration(p)

  /* Offline media — nothing else matters if it will render black. */
  const missing = p.clips.filter((c) => {
    const s = p.sources.find((x) => x.id === c.sourceId)
    return !s || (!s.path && !s.url)
  })
  if (missing.length) {
    out.push({
      id: 'offline',
      severity: 'flag',
      title: `${missing.length} clip${missing.length > 1 ? 's are' : ' is'} offline`,
      detail: 'The footage behind these clips was imported in a browser session and is gone. Import it again to relink.',
    })
  }

  /* The hook, read with the sound off. */
  const firstText = [...p.texts].sort((a, b) => a.start - b.start)[0]
  if (!firstText) {
    out.push({
      id: 'no-text',
      severity: 'note',
      title: 'Nothing on screen to read',
      detail: 'Most viewers decide with the sound off in the first second. A hook line on screen from frame one works for them too.',
    })
  } else if (firstText.start > HOOK_TEXT_BY) {
    out.push({
      id: 'hook-text-late',
      severity: firstText.start > 1.5 ? 'flag' : 'note',
      title: `Nothing to read until ${fmt(firstText.start)}`,
      detail: 'The sound-off viewer is deciding in the first second. Put the hook line on screen from the start.',
      at: firstText.start,
      fix: { label: 'Start it at 0s', apply: (x) => updateText(x, firstText.id, { start: 0 }) },
    })
  }

  /* The half-second audit. */
  const crowded = crowdedMoments(p)
  for (const [i, moment] of crowded.entries()) {
    const kinds = [...new Set(moment.events.map((e) => e.what))].join(', ')
    out.push({
      id: `crowded-${i}`,
      severity: 'flag',
      title: `${moment.events.length} things start at once around ${fmt(moment.start)}`,
      detail: `${kinds[0].toUpperCase()}${kinds.slice(1)} inside half a second — everything competes and nothing lands. Stagger them ${STAGGER}s apart, or let one leave before the next arrives.`,
      at: moment.start,
      fix: p.texts.some((t) => t.start >= moment.start && t.start < moment.end)
        ? { label: 'Stagger the text', apply: (x) => staggerWindow(x, moment.start, moment.end) }
        : undefined,
    })
  }
  if (!crowded.length && motionEvents(p).length > 2) {
    out.push({
      id: 'audit-clean',
      severity: 'good',
      title: 'Passes the half-second audit',
      detail: 'No half-second holds more than one thing starting plus its accent.',
    })
  }

  /* Captions that leave before they can be read. */
  for (const t of p.texts) {
    const need = readableDuration(t.text, t.animation)
    if (t.duration + 1e-9 < need) {
      out.push({
        id: `short-${t.id}`,
        severity: 'note',
        title: `“${t.text.replace(/\*/g, '').slice(0, 32)}” is gone before it’s read`,
        detail: `Up for ${fmt(t.duration)}; arriving, reading and leaving needs about ${fmt(need)}.`,
        at: t.start,
        fix: { label: `Hold for ${fmt(need)}`, apply: (x) => updateText(x, t.id, { duration: need }) },
      })
    }
  }

  /* Jump cuts: merge the tiny ones, mask the rest. */
  for (let i = 1; i < p.clips.length; i++) {
    const prev = p.clips[i - 1]
    const clip = p.clips[i]
    const dressed = clip.transition && clip.transition.preset !== 'cut'
    if (prev.sourceId !== clip.sourceId || dressed) continue
    const removed = clip.in - prev.out
    if (removed < 0 || removed > JUMP_CUT_UP_TO) continue
    const at = placed[i].start
    if (removed > 0.001 && removed < MERGE_BELOW) {
      out.push({
        id: `merge-${clip.id}`,
        severity: 'note',
        title: `A jump at ${fmt(at)} that only removed ${Math.round(removed * 1000)}ms`,
        detail: 'A join that removes a fraction of a second was cutting a pause that was doing work. Merge it back into one shot.',
        at,
        fix: {
          label: 'Merge the shots',
          apply: (x) => {
            const merged = updateClip(x, prev.id, { out: clip.out })
            return { ...merged, clips: merged.clips.filter((c) => c.id !== clip.id) }
          },
        },
      })
    } else if (removed >= MERGE_BELOW && Math.abs(clip.zoom - prev.zoom) < 0.05) {
      out.push({
        id: `jump-${clip.id}`,
        severity: 'note',
        title: `Unmasked jump cut at ${fmt(at)}`,
        detail: 'Same shot, same framing, a moment missing — the eye reads it as a glitch. Alternate a 110–120% punch-in so it reads as a choice.',
        at,
        fix: {
          label: prev.zoom > 1.05 ? 'Pull back to 100%' : `Punch in to ${Math.round(PUNCH_IN * 100)}%`,
          apply: (x) => updateClip(x, clip.id, { zoom: prev.zoom > 1.05 ? 1 : PUNCH_IN }),
        },
      })
    }
  }

  /* Transitions: a hard cut is a beat; a flash is a once-a-video event. */
  const dressed = p.clips.slice(1).filter((c) => c.transition && c.transition.preset !== 'cut')
  const flashes = dressed.filter((c) => c.transition!.preset === 'flash')
  if (flashes.length > 1) {
    out.push({
      id: 'flashes',
      severity: 'note',
      title: `${flashes.length} flash transitions`,
      detail: 'A flash lands because it is rare. Keep the one on the biggest turn and cut the rest straight.',
    })
  }
  if (p.clips.length >= 5 && dressed.length / (p.clips.length - 1) > 0.5) {
    out.push({
      id: 'over-dressed',
      severity: 'note',
      title: 'Most cuts carry a transition',
      detail: 'A straight cut is a beat the viewer feels. Save transitions for changes of idea.',
    })
  }

  /* The cut against its own plan. */
  if (episode && episode.scenes.length) {
    const tagged = p.clips.some((c) => c.sceneId)
    if (!tagged) {
      out.push({
        id: 'untagged',
        severity: 'note',
        title: 'Clips aren’t tagged with script beats',
        detail: 'Tag each clip with the beat it covers and your retention and playbook findings can judge the cut itself, not just the plan.',
        fix: { label: 'Match clips to beats in order', apply: (x) => matchClipsToBeats(x, episode) },
      })
    } else {
      const cut = new Map(cutMarkers(p, episode).map((m) => [m.sceneId, m]))
      for (const scene of episode.scenes) {
        const m = cut.get(scene.id)
        const planned = scene.end - scene.start
        if (!m || planned <= 0) continue
        const actual = m.end - m.start
        if (actual > planned * 1.5 && actual - planned > 1.5) {
          out.push({
            id: `long-${scene.id}`,
            severity: 'note',
            title: `${scene.purpose} runs ${fmt(actual)} against ${fmt(planned)} planned`,
            detail: 'The script gave this beat less room. If the extra time isn’t earning its place, trim toward the plan.',
            at: m.start,
            sceneId: scene.id,
          })
        }
      }
      const uncovered = episode.scenes.filter((s) => !cut.has(s.id))
      if (uncovered.length) {
        out.push({
          id: 'uncovered',
          severity: 'note',
          title: `${uncovered.length} script beat${uncovered.length > 1 ? 's have' : ' has'} no footage`,
          detail: uncovered.map((s) => s.purpose).join(', ') + '. Either the footage is still to come, or the beat was cut on purpose.',
        })
      }
    }
    if (episode.length > 0 && runtime > episode.length * 1.25 && runtime - episode.length > 3) {
      out.push({
        id: 'runtime',
        severity: 'note',
        title: `Runs ${fmt(runtime)} against a ${fmt(episode.length)} plan`,
        detail: 'Short-form runtime is felt, not measured. Find the beat that grew and ask if it earned it.',
      })
    }
  }

  const order: Record<InsightSeverity, number> = { flag: 0, note: 1, good: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity] || (a.at ?? 0) - (b.at ?? 0))
}
