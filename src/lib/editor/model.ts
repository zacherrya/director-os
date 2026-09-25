/**
 * The edit: what footage plays when, and what sits on top of it.
 *
 * Deliberately a plain data structure with pure operations, so the timeline,
 * the preview, the export and the insight checks all read one source of truth
 * and every operation can be tested without a video file in sight.
 *
 * The picture is one magnetic track. Clips play back to back; a transition
 * overlaps the tail of one clip with the head of the next, so a 0.3s dissolve
 * shortens the cut by 0.3s — the way every NLE behaves, and the only way a
 * dissolve can have two real frames to blend. A transition is capped at half of
 * the shorter clip either side of it, which guarantees that at most two clips
 * are ever on screen at once and that no transition can swallow a whole clip.
 *
 * Text is a free overlay track in absolute time, because captions follow the
 * words, not the cuts.
 *
 * Media is referenced, never copied: a source is a path on disk that streams
 * through Tauri's asset protocol. A four-minute 4K clip in IndexedDB would be a
 * gigabyte of duplicated footage and a quota error waiting to happen.
 */

import type { Episode, Scene } from '../types.ts'

export type TransitionId =
  | 'cut'
  | 'dissolve'
  | 'soft-blur'
  | 'dip-black'
  | 'flash'
  | 'zoom-punch'
  | 'whip'
  | 'slide-up'

export type TextAnimationId =
  | 'rise'
  | 'pop'
  | 'word-pop'
  | 'karaoke'
  | 'typewriter'
  | 'blur-in'
  | 'punch'
  | 'cascade'
  | 'wipe'

export type FontComboId =
  | 'clean-caption'
  | 'bold-impact'
  | 'editorial'
  | 'poster'
  | 'label-pill'
  | 'handwritten'
  | 'mono-label'
  | 'classic-serif'

export interface EditSource {
  id: string
  name: string
  kind: 'video' | 'image'
  /** Absolute path on disk. Streams through the asset protocol; survives relaunch. */
  path?: string
  /**
   * A session-only object URL, used when running outside the desktop shell.
   * Never meaningful after a reload — a source with only a `url` is offline
   * until it is imported again.
   */
  url?: string
  /** Seconds. Zero for a still image, which has no natural length. */
  duration: number
  width: number
  height: number
  hasAudio: boolean
}

export interface TransitionRef {
  preset: TransitionId
  /** Requested length in seconds. The placed length may be shorter — see `transitionLength`. */
  duration: number
}

export interface EditClip {
  id: string
  sourceId: string
  /** Source seconds where the clip starts. */
  in: number
  /** Source seconds where the clip ends. Always greater than `in`. */
  out: number
  /** The script beat this footage covers. Links the cut back to the plan. */
  sceneId?: string
  /** Transition from the previous clip into this one. Ignored on the first clip. */
  transition?: TransitionRef
  /**
   * 1 fills the frame; 1.12 is a punch-in. Alternating punch-ins are how a
   * jump cut stops reading as a mistake.
   */
  zoom: number
  /** 0 mutes the clip's own sound; 1 is as recorded. */
  volume: number
}

export type TextPosition = 'top' | 'center' | 'bottom'

export interface EditText {
  id: string
  /** Words wrapped in *asterisks* take the style's accent treatment. */
  text: string
  start: number
  duration: number
  style: FontComboId
  animation: TextAnimationId
  position: TextPosition
  sceneId?: string
}

export interface EditProject {
  episodeId: string
  width: number
  height: number
  fps: number
  sources: EditSource[]
  clips: EditClip[]
  texts: EditText[]
  updatedAt: string
}

/** Two frames at 30fps. Anything shorter is a flash frame, not a clip. */
export const MIN_CLIP_SECONDS = 2 / 30
/** How long a still image runs when it is first dropped on the timeline. */
export const IMAGE_DEFAULT_SECONDS = 3
/** Stills have no natural end, but an unbounded trim handle is a trap. */
export const IMAGE_MAX_SECONDS = 60
/** A caption needs time to arrive and time to be read. */
export const MIN_TEXT_SECONDS = 0.5

type IdFactory = () => string
const newId: IdFactory = () => crypto.randomUUID()

export function dimensionsFor(format: Episode['format']): { width: number; height: number } {
  if (format === '1:1') return { width: 1080, height: 1080 }
  if (format === '16:9') return { width: 1920, height: 1080 }
  return { width: 1080, height: 1920 }
}

export function newProject(episode: Pick<Episode, 'id' | 'format'>, fps = 30): EditProject {
  return {
    episodeId: episode.id,
    ...dimensionsFor(episode.format),
    fps,
    sources: [],
    clips: [],
    texts: [],
    updatedAt: new Date().toISOString(),
  }
}

const touch = (p: EditProject): EditProject => ({ ...p, updatedAt: new Date().toISOString() })
export const clipLength = (c: Pick<EditClip, 'in' | 'out'>) => Math.max(0, c.out - c.in)

/* ---------------------------------------------------------------- layout --- */

export interface PlacedTransition {
  preset: TransitionId
  start: number
  end: number
}

export interface PlacedClip {
  clip: EditClip
  index: number
  /** Timeline seconds. */
  start: number
  end: number
  /** The overlap with the previous clip, when there is one. */
  transition: PlacedTransition | null
}

/** The transition length that will actually be used, after capping. */
export function transitionLength(prev: EditClip | undefined, clip: EditClip): number {
  if (!prev || !clip.transition || clip.transition.preset === 'cut') return 0
  const cap = Math.min(clipLength(prev), clipLength(clip)) / 2
  return Math.max(0, Math.min(clip.transition.duration, cap))
}

export function layout(clips: EditClip[]): PlacedClip[] {
  const placed: PlacedClip[] = []
  let cursor = 0
  clips.forEach((clip, index) => {
    const overlap = transitionLength(clips[index - 1], clip)
    const start = Math.max(0, cursor - overlap)
    const end = start + clipLength(clip)
    placed.push({
      clip,
      index,
      start,
      end,
      transition: overlap > 0 ? { preset: clip.transition!.preset, start, end: start + overlap } : null,
    })
    cursor = end
  })
  return placed
}

export function totalDuration(p: Pick<EditProject, 'clips'>): number {
  const placed = layout(p.clips)
  return placed.length ? placed[placed.length - 1].end : 0
}

export interface ClipFrame {
  clip: EditClip
  /** Where in the source this timeline moment lands. */
  sourceTime: number
}

export type FrameLayers =
  | { kind: 'empty' }
  | { kind: 'solo'; layer: ClipFrame }
  | { kind: 'transition'; out: ClipFrame; in: ClipFrame; preset: TransitionId; progress: number }

const frameOf = (p: PlacedClip, t: number): ClipFrame => ({
  clip: p.clip,
  sourceTime: Math.min(p.clip.out, p.clip.in + Math.max(0, t - p.start)),
})

/**
 * What is on screen at timeline time `t`. The final instant of the cut shows
 * the last frame rather than black, so scrubbing to the end never flickers.
 */
export function layersAt(placed: PlacedClip[], t: number): FrameLayers {
  if (placed.length === 0) return { kind: 'empty' }
  const last = placed[placed.length - 1]
  const time = Math.min(Math.max(0, t), Math.max(0, last.end - 1e-6))

  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]
    if (time < p.start || time >= p.end) continue
    const next = placed[i + 1]
    if (next?.transition && time >= next.transition.start) {
      const { start, end, preset } = next.transition
      return {
        kind: 'transition',
        out: frameOf(p, time),
        in: frameOf(next, time),
        preset,
        progress: Math.min(1, Math.max(0, (time - start) / (end - start))),
      }
    }
    return { kind: 'solo', layer: frameOf(p, time) }
  }
  return { kind: 'solo', layer: frameOf(last, last.end) }
}

export function textsAt(texts: EditText[], t: number): EditText[] {
  return texts.filter((x) => t >= x.start && t < x.start + x.duration)
}

/* ------------------------------------------------------------ clip edits --- */

export function addSource(p: EditProject, source: EditSource): EditProject {
  // Re-importing a file already in the bin keeps the existing id, so every clip
  // that references it stays connected.
  const existing = source.path ? p.sources.find((s) => s.path === source.path) : undefined
  if (existing) return p
  return touch({ ...p, sources: [...p.sources, source] })
}

export function addClip(
  p: EditProject,
  sourceId: string,
  options: { index?: number; sceneId?: string; id?: string } = {},
): EditProject {
  const source = p.sources.find((s) => s.id === sourceId)
  if (!source) return p
  const out = source.kind === 'image' ? IMAGE_DEFAULT_SECONDS : source.duration
  if (out < MIN_CLIP_SECONDS) return p
  const clip: EditClip = {
    id: options.id ?? newId(),
    sourceId,
    in: 0,
    out,
    sceneId: options.sceneId,
    zoom: 1,
    volume: source.hasAudio ? 1 : 0,
  }
  const clips = [...p.clips]
  clips.splice(options.index ?? clips.length, 0, clip)
  return touch({ ...p, clips })
}

export function updateClip(p: EditProject, clipId: string, patch: Partial<Omit<EditClip, 'id'>>): EditProject {
  return touch({ ...p, clips: p.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) })
}

export function removeClip(p: EditProject, clipId: string): EditProject {
  return touch({ ...p, clips: p.clips.filter((c) => c.id !== clipId) })
}

export function moveClip(p: EditProject, clipId: string, toIndex: number): EditProject {
  const from = p.clips.findIndex((c) => c.id === clipId)
  if (from < 0) return p
  const clips = [...p.clips]
  const [clip] = clips.splice(from, 1)
  clips.splice(Math.max(0, Math.min(toIndex, clips.length)), 0, clip)
  return touch({ ...p, clips })
}

function sourceMax(p: EditProject, clip: EditClip): number {
  const source = p.sources.find((s) => s.id === clip.sourceId)
  if (!source || source.kind === 'image') return IMAGE_MAX_SECONDS
  return source.duration
}

/**
 * Moves one edge of a clip to a new source time, clamped to the media and to
 * a minimum length. Out-of-range requests land on the nearest legal value
 * rather than being refused, which is what dragging a handle should feel like.
 */
export function trimClip(p: EditProject, clipId: string, edge: 'in' | 'out', sourceTime: number): EditProject {
  const clip = p.clips.find((c) => c.id === clipId)
  if (!clip) return p
  if (edge === 'in') {
    const value = Math.max(0, Math.min(sourceTime, clip.out - MIN_CLIP_SECONDS))
    return updateClip(p, clipId, { in: value })
  }
  const value = Math.min(sourceMax(p, clip), Math.max(sourceTime, clip.in + MIN_CLIP_SECONDS))
  return updateClip(p, clipId, { out: value })
}

/**
 * Splits whichever clip is under the playhead. Refuses inside a transition,
 * where "the clip under the playhead" has two answers, and refuses a split
 * that would leave either half shorter than a clip is allowed to be.
 */
export function splitAt(p: EditProject, t: number, id: IdFactory = newId): EditProject {
  const placed = layout(p.clips)
  const target = placed.find((x) => t > x.start && t < x.end)
  if (!target) return p
  const next = placed[target.index + 1]
  const inTransition =
    (target.transition && t < target.transition.end) || (next?.transition && t >= next.transition.start)
  if (inTransition) return p

  const cut = target.clip.in + (t - target.start)
  if (cut - target.clip.in < MIN_CLIP_SECONDS || target.clip.out - cut < MIN_CLIP_SECONDS) return p

  const head: EditClip = { ...target.clip, out: cut }
  const tail: EditClip = { ...target.clip, id: id(), in: cut, transition: undefined }
  const clips = [...p.clips]
  clips.splice(target.index, 1, head, tail)
  return touch({ ...p, clips })
}

export function setTransition(p: EditProject, clipId: string, transition: TransitionRef | undefined): EditProject {
  return updateClip(p, clipId, { transition })
}

/* ------------------------------------------------------------ text edits --- */

export function addText(p: EditProject, text: Omit<EditText, 'id'> & { id?: string }): EditText[] {
  return [...p.texts, { ...text, id: text.id ?? newId(), duration: Math.max(MIN_TEXT_SECONDS, text.duration) }]
}

export function withText(p: EditProject, text: Omit<EditText, 'id'> & { id?: string }): EditProject {
  return touch({ ...p, texts: addText(p, text) })
}

export function updateText(p: EditProject, textId: string, patch: Partial<Omit<EditText, 'id'>>): EditProject {
  return touch({
    ...p,
    texts: p.texts.map((x) =>
      x.id === textId
        ? {
            ...x,
            ...patch,
            start: Math.max(0, patch.start ?? x.start),
            duration: Math.max(MIN_TEXT_SECONDS, patch.duration ?? x.duration),
          }
        : x,
    ),
  })
}

export function removeText(p: EditProject, textId: string): EditProject {
  return touch({ ...p, texts: p.texts.filter((x) => x.id !== textId) })
}

/* ---------------------------------------------------- the plan, in the cut --- */

export interface SceneMarker {
  sceneId: string
  purpose: Scene['purpose']
  index: number
  start: number
  end: number
}

/** The script's own timing — where each beat was planned to sit. */
export function plannedMarkers(episode: Pick<Episode, 'scenes'>): SceneMarker[] {
  return [...episode.scenes]
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ sceneId: s.id, purpose: s.purpose, index: s.index, start: s.start, end: s.end }))
}

/** Where each beat actually landed in the cut, from the clips tagged with it. */
export function cutMarkers(p: EditProject, episode: Pick<Episode, 'scenes'>): SceneMarker[] {
  const placed = layout(p.clips)
  const markers: SceneMarker[] = []
  for (const scene of episode.scenes) {
    const mine = placed.filter((x) => x.clip.sceneId === scene.id)
    if (!mine.length) continue
    markers.push({
      sceneId: scene.id,
      purpose: scene.purpose,
      index: scene.index,
      start: Math.min(...mine.map((x) => x.start)),
      end: Math.max(...mine.map((x) => x.end)),
    })
  }
  return markers.sort((a, b) => a.start - b.start)
}

/**
 * The episode as it was actually cut, for the draft check to judge.
 *
 * Only beats with footage are kept, re-timed to where they landed, and the
 * runtime is the cut's. Beats with nothing tagged are dropped rather than left
 * at their planned times, because a planned time sitting next to real ones
 * would give the checks a video that exists nowhere.
 */
export function episodeAsCut(episode: Episode, p: EditProject): { episode: Episode; beatsCovered: number } {
  const markers = cutMarkers(p, episode)
  const byId = new Map(markers.map((m) => [m.sceneId, m]))
  const scenes = episode.scenes
    .filter((s) => byId.has(s.id))
    .map((s) => ({ ...s, start: byId.get(s.id)!.start, end: byId.get(s.id)!.end }))
    .sort((a, b) => a.start - b.start)
    .map((s, i) => ({ ...s, index: i }))
  return {
    episode: { ...episode, scenes, length: Math.round(totalDuration(p)) },
    beatsCovered: scenes.length,
  }
}

/**
 * Tags clips with beats in script order, one clip per beat, for the common
 * case of footage shot in order. Clips beyond the last beat are left alone.
 */
export function matchClipsToBeats(p: EditProject, episode: Pick<Episode, 'scenes'>): EditProject {
  const beats = [...episode.scenes].sort((a, b) => a.start - b.start)
  return touch({
    ...p,
    clips: p.clips.map((c, i) => (beats[i] ? { ...c, sceneId: beats[i].id } : c)),
  })
}
