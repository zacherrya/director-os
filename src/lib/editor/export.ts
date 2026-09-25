/**
 * Renders the edit to an MP4, entirely inside the app.
 *
 * WebCodecs does the heavy lifting — the desktop app's WebKit decodes HEVC from
 * an iPhone and encodes H.264 and AAC in hardware — and Mediabunny handles the
 * containers. No ffmpeg ships with the app and nothing leaves the machine.
 *
 * Frames come from the same `drawFrame` the preview uses, so the render is the
 * preview. What differs is where source frames come from: the preview uses
 * <video> elements, which are fast but only approximately seekable, whereas the
 * render decodes every frame it needs exactly, in order, per clip.
 *
 * Audio is mixed offline: each clip's sound is decoded for the range it plays,
 * laid at its place on the timeline, faded across transitions so a dissolve
 * crossfades the sound as well as the picture, and encoded once.
 */

import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  UrlSource,
  canEncodeAudio,
  type WrappedCanvas,
} from 'mediabunny'
import { layersAt, layout, totalDuration, type EditClip, type EditProject, type EditSource } from './model.ts'
import { drawFrame, ensureEditorFonts } from './render.ts'

export type ExportQuality = 'standard' | 'high'

/** H.264 bitrates for a 1080-wide vertical frame. Instagram re-encodes anyway; these keep detail through it. */
const VIDEO_BITRATE: Record<ExportQuality, number> = { standard: 10_000_000, high: 16_000_000 }
const AUDIO_RATE = 48_000

export interface ExportProgress {
  /** 0–1. */
  fraction: number
  label: string
}

export interface ExportOptions {
  quality: ExportQuality
  /** A URL the webview can fetch for a source — the asset-protocol URL on desktop. */
  resolveUrl: (source: EditSource) => Promise<string | null>
  onProgress?: (p: ExportProgress) => void
  signal?: AbortSignal
}

export class ExportAborted extends Error {
  constructor() {
    super('Export cancelled.')
  }
}

interface OpenSource {
  input: Input
  /** Where the media's own timeline starts — not always zero on phone footage. */
  firstTimestamp: number
}

/**
 * Opens a source for random access. Tries ranged reads first, which stream a
 * large file without loading it; falls back to reading it whole, which costs
 * memory but works on any URL scheme that can be fetched at all.
 */
async function openSource(url: string): Promise<OpenSource> {
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) })
    await input.getTracks()
    return { input, firstTimestamp: await input.getFirstTimestamp() }
  } catch {
    const blob = await (await fetch(url)).blob()
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) })
    return { input, firstTimestamp: await input.getFirstTimestamp() }
  }
}

async function loadImage(url: string): Promise<ImageBitmap> {
  const blob = await (await fetch(url)).blob()
  return createImageBitmap(blob)
}

function check(signal?: AbortSignal) {
  if (signal?.aborted) throw new ExportAborted()
}

/**
 * The source timestamps each clip needs, frame by frame, in the order the frame
 * loop will ask for them. Always monotonic within a clip, which is what lets the
 * decoder read each packet once.
 */
export function framePlan(project: EditProject): { frames: number; needs: Map<string, number[]> } {
  const placed = layout(project.clips)
  const frames = Math.max(1, Math.ceil(totalDuration(project) * project.fps))
  const needs = new Map<string, number[]>()
  for (let i = 0; i < frames; i++) {
    const layers = layersAt(placed, i / project.fps)
    const list =
      layers.kind === 'solo' ? [layers.layer] : layers.kind === 'transition' ? [layers.out, layers.in] : []
    for (const l of list) {
      const arr = needs.get(l.clip.id) ?? []
      arr.push(l.sourceTime)
      needs.set(l.clip.id, arr)
    }
  }
  return { frames, needs }
}

/* ----------------------------------------------------------------- audio --- */

/**
 * Mixes every clip's own sound onto one stereo track. Returns null when nothing
 * in the edit makes a sound, so the file gets no silent audio track.
 */
async function mixAudio(
  project: EditProject,
  opened: Map<string, OpenSource>,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  const placed = layout(project.clips)
  const duration = totalDuration(project)
  const audible = placed.filter((p) => {
    const s = project.sources.find((x) => x.id === p.clip.sourceId)
    return s?.hasAudio && p.clip.volume > 0 && opened.has(s.id)
  })
  if (!audible.length || duration <= 0) return null

  const ctx = new OfflineAudioContext(2, Math.ceil(duration * AUDIO_RATE), AUDIO_RATE)
  let any = false

  for (const p of audible) {
    check(signal)
    const { input, firstTimestamp } = opened.get(p.clip.sourceId)!
    const track = await input.getPrimaryAudioTrack()
    if (!track) continue
    const sink = new AudioBufferSink(track)

    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    const v = p.clip.volume
    const g = gain.gain
    // Fade in across this clip's incoming transition, out across the next one's,
    // so a dissolve crossfades the sound too. A cut gets a 10ms ramp to avoid a click.
    const next = placed[p.index + 1]
    const fadeIn = p.transition ? p.transition.end - p.transition.start : 0.01
    const fadeOutStart = next?.transition ? next.transition.start : p.end - 0.01
    g.setValueAtTime(0, p.start)
    g.linearRampToValueAtTime(v, p.start + fadeIn)
    g.setValueAtTime(v, Math.max(p.start + fadeIn, fadeOutStart))
    g.linearRampToValueAtTime(0, p.end)

    const from = firstTimestamp + p.clip.in
    const to = firstTimestamp + p.clip.out
    for await (const chunk of sink.buffers(from, to)) {
      check(signal)
      // Where this chunk sits on the timeline, and how much of its head falls before the clip's in-point.
      const offsetIn = Math.max(0, from - chunk.timestamp)
      const when = p.start + (chunk.timestamp + offsetIn - from)
      const length = Math.min(chunk.duration - offsetIn, to - (chunk.timestamp + offsetIn))
      if (length <= 0) continue
      const node = ctx.createBufferSource()
      node.buffer = chunk.buffer
      node.connect(gain)
      node.start(Math.max(0, when), offsetIn, length)
      any = true
    }
  }
  return any ? ctx.startRendering() : null
}

/* ---------------------------------------------------------------- render --- */

export async function renderEdit(project: EditProject, options: ExportOptions): Promise<Uint8Array> {
  const { signal, onProgress } = options
  const report = (fraction: number, label: string) => onProgress?.({ fraction, label })

  if (!project.clips.length) throw new Error('There is nothing on the timeline to render.')
  report(0, 'Loading fonts…')
  await ensureEditorFonts()

  // Open every source the cut actually uses, once.
  const used = new Set(project.clips.map((c) => c.sourceId))
  const opened = new Map<string, OpenSource>()
  const stills = new Map<string, ImageBitmap>()
  for (const source of project.sources.filter((s) => used.has(s.id))) {
    check(signal)
    report(0.01, `Opening ${source.name}…`)
    const url = await options.resolveUrl(source)
    if (!url) throw new Error(`“${source.name}” is offline. Import it again before rendering.`)
    if (source.kind === 'image') stills.set(source.id, await loadImage(url))
    else opened.set(source.id, await openSource(url))
  }

  const { frames, needs } = framePlan(project)
  const W = project.width
  const H = project.height
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(W, H)
      : Object.assign(document.createElement('canvas'), { width: W, height: H })
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const video = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: VIDEO_BITRATE[options.quality],
    keyFrameInterval: 2,
  })
  output.addVideoTrack(video, { frameRate: project.fps })

  // Audio is decided before starting, because tracks can't be added after.
  report(0.02, 'Mixing sound…')
  const mix = await mixAudio(project, opened, signal)
  let audio: AudioBufferSource | null = null
  if (mix) {
    const codec = (await canEncodeAudio('aac')) ? 'aac' : (await canEncodeAudio('opus')) ? 'opus' : null
    if (codec) {
      audio = new AudioBufferSource({ codec, bitrate: 192_000 })
      output.addAudioTrack(audio)
    }
  }

  await output.start()

  // One ordered decode stream per clip, pulled in lockstep with the frame loop.
  const streams = new Map<string, AsyncGenerator<WrappedCanvas | null, void, unknown>>()
  for (const clip of project.clips) {
    const source = project.sources.find((s) => s.id === clip.sourceId)
    const open = source && opened.get(source.id)
    const times = needs.get(clip.id)
    if (!open || !times?.length) continue
    const track = await open.input.getPrimaryVideoTrack()
    if (!track) continue
    const sink = new CanvasSink(track, { poolSize: 4 })
    streams.set(clip.id, sink.canvasesAtTimestamps(times.map((t) => open.firstTimestamp + t)))
  }

  const placed = layout(project.clips)
  const current = new Map<string, CanvasImageSource | null>()
  const frameFor = (clip: EditClip) => {
    const still = stills.get(clip.sourceId)
    return still ?? current.get(clip.id) ?? null
  }

  try {
    for (let i = 0; i < frames; i++) {
      check(signal)
      const t = i / project.fps
      const layers = layersAt(placed, t)
      const onScreen =
        layers.kind === 'solo' ? [layers.layer.clip] : layers.kind === 'transition' ? [layers.out.clip, layers.in.clip] : []
      for (const clip of onScreen) {
        const stream = streams.get(clip.id)
        if (!stream) continue
        const next = await stream.next()
        // A missing frame holds the last good one rather than flashing black.
        if (!next.done && next.value) current.set(clip.id, next.value.canvas)
      }
      drawFrame(ctx, project, placed, t, frameFor)
      await video.add(t, 1 / project.fps)
      if (i % 10 === 0) report(0.03 + 0.92 * (i / frames), `Rendering frame ${i + 1} of ${frames}`)
    }

    if (audio && mix) {
      report(0.96, 'Encoding sound…')
      await audio.add(mix)
    }
    report(0.98, 'Finishing the file…')
    await output.finalize()
  } catch (err) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {})
    throw err
  } finally {
    for (const s of streams.values()) await s.return(undefined).catch(() => {})
    for (const o of opened.values()) o.input.dispose()
    for (const b of stills.values()) b.close()
  }

  if (!target.buffer) throw new Error('The render produced no file.')
  report(1, 'Done')
  return new Uint8Array(target.buffer)
}
