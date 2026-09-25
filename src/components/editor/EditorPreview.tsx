import { useEffect, useMemo, useRef } from 'react'
import { layersAt, totalDuration, type ClipFrame, type EditClip, type EditProject, type PlacedClip } from '../../lib/editor/model'
import { drawFrame } from '../../lib/editor/render'

/**
 * The live preview.
 *
 * Playback runs on a wall clock, not on a video's own clock: text animations and
 * transitions are pure functions of timeline time, so the clock that drives them
 * has to be the timeline's. The <video> elements are slaved to it — nudged back
 * when they drift, sought when a clip begins — and only ever supply pixels.
 *
 * Each source gets at most two video elements, used alternately by even and odd
 * clips, so a dissolve between two cuts of the same take still has two real
 * frames to blend without one element per clip piling up.
 *
 * Draws at half resolution. Every size in the looks is relative to frame width,
 * so the half-size frame is the full-size frame, smaller.
 */

const PREVIEW_SCALE = 0.5
/** How far ahead of a cut the next clip is sought, so it is ready when it lands. */
const PREROLL = 0.8
/** Drift tolerated during playback before a video is pulled back into line. */
const DRIFT = 0.25

interface Props {
  project: EditProject
  placed: PlacedClip[]
  time: number
  playing: boolean
  /** Source id → a loadable URL, or null when offline. */
  urls: Record<string, string | null>
  onTime: (t: number) => void
  onEnd: () => void
}

export function EditorPreview({ project, placed, time, playing, urls, onTime, onEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const videos = useRef(new Map<string, HTMLVideoElement>())
  const images = useRef(new Map<string, HTMLImageElement>())

  const W = Math.round(project.width * PREVIEW_SCALE)
  const H = Math.round(project.height * PREVIEW_SCALE)
  const view = useMemo(() => ({ width: W, height: H, texts: project.texts }), [W, H, project.texts])
  const indexOf = useMemo(() => new Map(placed.map((p) => [p.clip.id, p.index])), [placed])

  // The render loop reads live values through a ref rather than restarting on every change.
  const live = useRef({ project, placed, urls, view, indexOf, time })
  live.current = { project, placed, urls, view, indexOf, time }

  const repaintRef = useRef<() => void>(() => {})

  function sourceOf(clip: EditClip) {
    return live.current.project.sources.find((s) => s.id === clip.sourceId)
  }

  function videoFor(clip: EditClip): HTMLVideoElement | null {
    const source = sourceOf(clip)
    if (!source || source.kind !== 'video') return null
    const url = live.current.urls[source.id]
    if (!url) return null
    const key = `${source.id}:${(live.current.indexOf.get(clip.id) ?? 0) % 2}`
    let v = videos.current.get(key)
    if (v && v.dataset.src !== url) {
      v.remove()
      v = undefined
    }
    if (!v) {
      v = document.createElement('video')
      v.dataset.src = url
      v.src = url
      v.preload = 'auto'
      v.playsInline = true
      v.muted = true
      // Kept in the document but invisible: some engines stop decoding a detached element.
      v.style.cssText = 'position:absolute;width:2px;height:2px;opacity:0;pointer-events:none'
      v.addEventListener('seeked', () => repaintRef.current())
      v.addEventListener('loadeddata', () => repaintRef.current())
      hostRef.current?.appendChild(v)
      videos.current.set(key, v)
    }
    return v
  }

  function imageFor(clip: EditClip): HTMLImageElement | null {
    const source = sourceOf(clip)
    const url = source && live.current.urls[source.id]
    if (!source || !url) return null
    let img = images.current.get(source.id)
    if (!img || img.src !== url) {
      img = new Image()
      img.src = url
      img.onload = () => repaintRef.current()
      images.current.set(source.id, img)
    }
    return img.complete && img.naturalWidth ? img : null
  }

  /** Points every on-screen video at the right moment, and pre-rolls the next clip. */
  function sync(t: number, isPlaying: boolean) {
    const { placed: pl, project: pr } = live.current
    const layers = layersAt(pl, t)
    const wanted = new Map<HTMLVideoElement, { time: number; volume: number }>()
    const want = (f: ClipFrame, gain: number) => {
      const v = videoFor(f.clip)
      if (v) wanted.set(v, { time: f.sourceTime, volume: Math.min(1, Math.max(0, f.clip.volume * gain)) })
    }
    if (layers.kind === 'solo') want(layers.layer, 1)
    if (layers.kind === 'transition') {
      want(layers.out, 1 - layers.progress)
      want(layers.in, layers.progress)
    }

    for (const v of videos.current.values()) {
      const w = wanted.get(v)
      if (!w) {
        if (!v.paused) v.pause()
        v.muted = true
        continue
      }
      v.volume = w.volume
      v.muted = !isPlaying || w.volume === 0
      if (isPlaying) {
        if (v.paused) {
          v.currentTime = w.time
          v.play().catch(() => {})
        } else if (Math.abs(v.currentTime - w.time) > DRIFT) {
          v.currentTime = w.time
        }
      } else {
        if (!v.paused) v.pause()
        if (Math.abs(v.currentTime - w.time) > 0.5 / pr.fps) v.currentTime = w.time
      }
    }

    // Pre-roll: seek the next clip's element to its in-point before the cut lands.
    if (layers.kind === 'solo') {
      const i = live.current.indexOf.get(layers.layer.clip.id) ?? -1
      const next = pl[i + 1]
      if (next && next.start - t < PREROLL) {
        const v = videoFor(next.clip)
        if (v && !wanted.has(v) && Math.abs(v.currentTime - next.clip.in) > 0.05) v.currentTime = next.clip.in
      }
    }
  }

  function paint(t: number) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawFrame(ctx, live.current.view, live.current.placed, t, (clip) => {
      const source = sourceOf(clip)
      if (source?.kind === 'image') return imageFor(clip)
      const v = videoFor(clip)
      return v && v.readyState >= 2 ? v : null
    })
  }

  repaintRef.current = () => {
    if (!playing) paint(live.current.time)
  }

  // Paused: follow the playhead exactly.
  useEffect(() => {
    if (playing) return
    sync(time, false)
    paint(time)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, playing, project, placed, urls, view])

  // Playing: a wall-clock loop that drives everything.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const wallStart = performance.now()
    const from = live.current.time
    const tick = () => {
      const duration = totalDuration(live.current.project)
      const t = from + (performance.now() - wallStart) / 1000
      if (t >= duration) {
        onEnd()
        return
      }
      sync(t, true)
      paint(t)
      onTime(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const pool = videos.current
    return () => {
      cancelAnimationFrame(raf)
      for (const v of pool.values()) v.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  // Tear down every element on the way out, so nothing keeps playing or decoding.
  useEffect(() => {
    const all = videos.current
    return () => {
      for (const v of all.values()) {
        v.pause()
        v.removeAttribute('src')
        v.load()
        v.remove()
      }
      all.clear()
    }
  }, [])

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="max-h-full max-w-full rounded-lg bg-black shadow-2xl ring-1 ring-white/5"
        style={{ aspectRatio: `${W} / ${H}` }}
      />
      <div ref={hostRef} aria-hidden className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden" />
    </div>
  )
}
