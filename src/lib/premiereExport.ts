// Exports an episode's blueprint — placeholder images, music, SFX and scene
// notes — as a Final Cut Pro 7 XML (XMEML) timeline plus the real media it
// references, zipped together. XMEML is the legacy interchange format
// Premiere Pro natively imports (File > Import); the modern FCPXML 1.x format
// is Final Cut Pro X-specific and isn't what Premiere's importer expects.
//
// The schema below was reverse-engineered by round-tripping real sequences
// through a live Premiere Pro session (export_as_fcp_xml, then re-importing a
// hand-written version via import_fcp_xml and inspecting the resulting
// sequence) rather than guessed — every element here is confirmed to land at
// the exact frame position Premiere expects.

import JSZip from 'jszip'
import type { Episode, OnScreenText, Project, Scene, SceneSfxCue } from './types'
import { PURPOSE_COLOR } from './types'
import { getFile } from './fileStore'
import { findSfx, findMusic, sfxDisplayLabel } from './audioEngine'
import { renderSfxToWav, renderMusicToWav } from './audioBounce'

const TIMEBASE = 30
const MIN_MUSIC_BLOCK_SECONDS = 0.5

function secondsToFrames(seconds: number): number {
  return Math.max(0, Math.round(seconds * TIMEBASE))
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'untitled'
}

function dimensionsForFormat(format: Episode['format']): { width: number; height: number } {
  if (format === '1:1') return { width: 1080, height: 1080 }
  if (format === '16:9') return { width: 1920, height: 1080 }
  return { width: 1080, height: 1920 } // 9:16
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = src
  })
}

/** CSS `object-fit: cover` — scale to fill, centered crop on the long axis. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number) {
  const srcRatio = img.naturalWidth / img.naturalHeight
  const dstRatio = width / height
  let sx = 0
  let sy = 0
  let sw = img.naturalWidth
  let sh = img.naturalHeight
  if (srcRatio > dstRatio) {
    sw = img.naturalHeight * dstRatio
    sx = (img.naturalWidth - sw) / 2
  } else {
    sh = img.naturalWidth / dstRatio
    sy = (img.naturalHeight - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height)
}

/** Matches PreviewPlayer/SceneThumbnail's "no image yet" look — a dark
 * diagonal gradient with the scene number and purpose in its accent color —
 * so a scene without an uploaded photo still becomes a real clip instead of
 * a gap on the timeline. */
function drawDefaultPlaceholder(ctx: CanvasRenderingContext2D, scene: Scene, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#1c1a17')
  gradient.addColorStop(1, '#0c0b0a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const color = PURPOSE_COLOR[scene.purpose] ?? '#d3a75c'

  // Small corner badge only — matches PreviewPlayer's top-left purpose pill —
  // so it never competes with on-screen text baked in over the center/top/bottom.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = color
  ctx.font = `600 ${Math.round(width * 0.026)}px Inter, sans-serif`
  ctx.fillText(`Scene ${scene.index} · ${scene.purpose}`, width * 0.04, height * 0.045)

  // The identifying caption only owns the center when there's no on-screen
  // text to clash with — otherwise the on-screen text is the whole point.
  if (!scene.onScreenText.text.trim()) {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = `${Math.round(width * 0.022)}px Inter, sans-serif`
    ctx.fillText('No storyboard image yet — generated placeholder', width / 2, height / 2)
  }
}

/** Soft-wraps by word to fit maxWidth, while still honoring explicit line
 * breaks in the source text (matches the app's `whitespace-pre-line`). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let current = words[0]
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate
      } else {
        lines.push(current)
        current = words[i]
      }
    }
    lines.push(current)
  }
  return lines
}

/** Bakes the scene's on-screen text directly into the frame — matches
 * PreviewPlayer's position/font/white-with-drop-shadow styling, just without
 * the entrance animation (a still frame has nothing to animate into). */
function drawOnScreenText(ctx: CanvasRenderingContext2D, onScreenText: OnScreenText, width: number, height: number) {
  const text = onScreenText.text.trim()
  if (!text) return

  const fontSize = Math.round(width * 0.062)
  ctx.font = `600 ${fontSize}px "${onScreenText.font}", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const lines = wrapLines(ctx, text, width * 0.86)
  const lineHeight = fontSize * 1.25
  const blockHeight = lineHeight * lines.length

  let startY: number
  if (onScreenText.position === 'Top') {
    startY = height * 0.09 + fontSize
  } else if (onScreenText.position === 'Bottom') {
    startY = height * 0.91 - blockHeight + fontSize
  } else {
    startY = height / 2 - blockHeight / 2 + fontSize
  }

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.65)'
  ctx.shadowBlur = fontSize * 0.3
  ctx.shadowOffsetY = fontSize * 0.06
  ctx.fillStyle = '#ffffff'
  lines.forEach((line, i) => ctx.fillText(line, width / 2, startY + i * lineHeight))
  ctx.restore()
}

async function renderSceneFrame(scene: Scene, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  if (scene.image) {
    const img = await loadImageElement(scene.image)
    drawCover(ctx, img, width, height)
  } else {
    drawDefaultPlaceholder(ctx, scene, width, height)
  }

  drawOnScreenText(ctx, scene.onScreenText, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))), 'image/png')
  })
}

/** Loads just enough of a real audio file to read its natural length —
 * used when a scene's SFX cue doesn't specify an explicit duration. */
function probeAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio()
    const done = (seconds: number) => {
      audio.src = ''
      resolve(seconds)
    }
    const timeout = window.setTimeout(() => done(1), 2000)
    audio.addEventListener(
      'loadedmetadata',
      () => {
        window.clearTimeout(timeout)
        done(Number.isFinite(audio.duration) ? audio.duration : 1)
      },
      { once: true },
    )
    audio.addEventListener('error', () => {
      window.clearTimeout(timeout)
      done(1)
    })
    audio.src = url
  })
}

interface MediaFile {
  zipPath: string
  blob: Blob
}

interface VideoClipPlan {
  sceneIndex: number
  name: string
  zipPath: string
  startSec: number
  endSec: number
  width: number
  height: number
}

interface AudioClipPlan {
  name: string
  zipPath: string
  startSec: number
  durationSec: number
  /** Seconds into the source file this clip starts from — 0 for bounced/rendered files. */
  sourceInSec: number
}

interface MarkerPlan {
  name: string
  comment: string
  startSec: number
  durationSec: number
}

interface ExportPlan {
  videoClips: VideoClipPlan[]
  musicClips: AudioClipPlan[]
  sfxClips: AudioClipPlan[]
  markers: MarkerPlan[]
  mediaFiles: MediaFile[]
}

async function resolveSceneVideoClip(
  scene: Scene,
  sceneIndex: number,
  width: number,
  height: number,
  mediaFiles: MediaFile[],
): Promise<VideoClipPlan> {
  const blob = await renderSceneFrame(scene, width, height)
  const zipPath = `media/images/scene-${String(sceneIndex + 1).padStart(2, '0')}.png`
  mediaFiles.push({ zipPath, blob })
  return { sceneIndex, name: zipPath.split('/').pop()!, zipPath, startSec: scene.start, endSec: scene.end, width, height }
}

async function resolveSceneMusic(
  scene: Scene,
  fileCache: Map<string, MediaFile>,
  mediaFiles: MediaFile[],
): Promise<AudioClipPlan | undefined> {
  if (!scene.audio.music) return undefined
  const sceneDuration = scene.end - scene.start
  const offset = Math.max(0, Math.min(scene.audio.musicOffset ?? 0, sceneDuration - MIN_MUSIC_BLOCK_SECONDS))
  const blockDuration = Math.max(
    MIN_MUSIC_BLOCK_SECONDS,
    Math.min(scene.audio.musicDuration ?? sceneDuration - offset, sceneDuration - offset),
  )
  const absStart = scene.start + offset

  if (scene.audio.musicFileId) {
    const cacheKey = `file:${scene.audio.musicFileId}`
    let file = fileCache.get(cacheKey)
    if (!file) {
      const blob = await getFile(scene.audio.musicFileId)
      if (!blob) return undefined
      const zipPath = `media/music/${sanitizeFilename(scene.audio.music)}-${scene.audio.musicFileId.slice(-6)}.${blob.type.includes('wav') ? 'wav' : 'mp3'}`
      file = { zipPath, blob }
      fileCache.set(cacheKey, file)
      mediaFiles.push(file)
    }
    return {
      name: scene.audio.music,
      zipPath: file.zipPath,
      startSec: absStart,
      durationSec: blockDuration,
      sourceInSec: scene.audio.musicTrimStart ?? 0,
    }
  }

  // Built-in synth track — no real file exists, so bounce it to a WAV sized
  // exactly to this block's duration (rounded to the frame grid first so the
  // rendered file's length matches what the XML places on the timeline).
  const def = findMusic(scene.audio.music)
  if (!def) return undefined
  const roundedDuration = secondsToFrames(blockDuration) / TIMEBASE
  const cacheKey = `synth-music:${def.id}:${roundedDuration.toFixed(4)}`
  let file = fileCache.get(cacheKey)
  if (!file) {
    const wav = await renderMusicToWav(def.id, roundedDuration)
    if (!wav) return undefined // e.g. "Music Cut (Silence)"
    const zipPath = `media/music/${sanitizeFilename(def.label)}-${cacheKey.slice(-4)}.wav`
    file = { zipPath, blob: wav }
    fileCache.set(cacheKey, file)
    mediaFiles.push(file)
  }
  return { name: def.label, zipPath: file.zipPath, startSec: absStart, durationSec: roundedDuration, sourceInSec: 0 }
}

async function resolveSceneSfxCue(
  scene: Scene,
  cue: SceneSfxCue,
  fileCache: Map<string, MediaFile>,
  mediaFiles: MediaFile[],
): Promise<AudioClipPlan | undefined> {
  const def = findSfx(cue.name)
  if (!def) return undefined
  const absStart = scene.start + cue.offset

  if (def.url) {
    const cacheKey = `file:${def.url}`
    let file = fileCache.get(cacheKey)
    if (!file) {
      const res = await fetch(def.url).catch(() => undefined)
      const blob = await res?.blob()
      if (!blob) return undefined
      const zipPath = `media/sfx/${sanitizeFilename(def.label)}.mp3`
      file = { zipPath, blob }
      fileCache.set(cacheKey, file)
      mediaFiles.push(file)
    }
    const duration = cue.duration ?? (await probeAudioDuration(def.url))
    return { name: sfxDisplayLabel(def), zipPath: file.zipPath, startSec: absStart, durationSec: duration, sourceInSec: 0 }
  }

  // Synth "Basic" SFX — bounce to WAV, sized to the cue's explicit duration
  // when given, else the def's own natural length.
  const duration = cue.duration ?? def.naturalDuration ?? 1
  const roundedDuration = secondsToFrames(duration) / TIMEBASE
  const cacheKey = `synth-sfx:${def.id}:${roundedDuration.toFixed(4)}`
  let file = fileCache.get(cacheKey)
  if (!file) {
    const rendered = await renderSfxToWav(def.id)
    if (!rendered) return undefined
    const zipPath = `media/sfx/${sanitizeFilename(def.label)}-${roundedDuration.toFixed(2)}s.wav`
    file = { zipPath, blob: rendered.blob }
    fileCache.set(cacheKey, file)
    mediaFiles.push(file)
  }
  return { name: sfxDisplayLabel(def), zipPath: file.zipPath, startSec: absStart, durationSec: roundedDuration, sourceInSec: 0 }
}

async function buildExportPlan(episode: Episode): Promise<ExportPlan> {
  await document.fonts.ready.catch(() => {}) // avoid the system-font fallback if Fraunces/Inter haven't finished loading yet
  const { width, height } = dimensionsForFormat(episode.format)

  const mediaFiles: MediaFile[] = []
  const fileCache = new Map<string, MediaFile>()

  const videoClips: VideoClipPlan[] = []
  const musicClips: AudioClipPlan[] = []
  const sfxClips: AudioClipPlan[] = []
  const markers: MarkerPlan[] = []

  for (let i = 0; i < episode.scenes.length; i++) {
    const scene = episode.scenes[i]

    videoClips.push(await resolveSceneVideoClip(scene, i, width, height, mediaFiles))

    const musicClip = await resolveSceneMusic(scene, fileCache, mediaFiles)
    if (musicClip) musicClips.push(musicClip)

    for (const cue of scene.audio.sfx) {
      const sfxClip = await resolveSceneSfxCue(scene, cue, fileCache, mediaFiles)
      if (sfxClip) sfxClips.push(sfxClip)
    }

    const commentParts = [
      !scene.image && 'Generated placeholder image — swap for real footage.',
      scene.dialogue && `Dialogue: ${scene.dialogue}`,
      scene.onScreenText.text && `On-screen text: "${scene.onScreenText.text}"`,
      scene.notes,
    ].filter((part): part is string => Boolean(part))

    markers.push({
      name: `Scene ${i + 1} — ${scene.purpose}`,
      comment: commentParts.join('\n\n'),
      startSec: scene.start,
      durationSec: scene.end - scene.start,
    })
  }

  return { videoClips, musicClips, sfxClips, markers, mediaFiles }
}

// ---------------------------------------------------------------------------
// XML generation
// ---------------------------------------------------------------------------

function fileBlock(fileId: string, zipPathToId: Map<string, string>, zipPath: string, name: string, media: string): string {
  const existingId = zipPathToId.get(zipPath)
  if (existingId) return `<file id="${existingId}"/>`
  zipPathToId.set(zipPath, fileId)
  return `<file id="${fileId}"><name>${xmlEscape(name)}</name><pathurl>${xmlEscape(zipPath)}</pathurl><rate><timebase>${TIMEBASE}</timebase><ntsc>FALSE</ntsc></rate>${media}</file>`
}

function videoClipItemXml(clip: VideoClipPlan, clipId: string, fileId: string, zipPathToId: Map<string, string>): string {
  const startFrames = secondsToFrames(clip.startSec)
  const endFrames = secondsToFrames(clip.endSec)
  const durationFrames = endFrames - startFrames
  const media = `<media><video><samplecharacteristics><rate><timebase>${TIMEBASE}</timebase><ntsc>FALSE</ntsc></rate><width>${clip.width}</width><height>${clip.height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video></media>`
  return `<clipitem id="${clipId}"><name>${xmlEscape(clip.name)}</name><enabled>TRUE</enabled><duration>${durationFrames}</duration><rate><timebase>${TIMEBASE}</timebase><ntsc>FALSE</ntsc></rate><start>${startFrames}</start><end>${endFrames}</end><in>0</in><out>${durationFrames}</out>${fileBlock(fileId, zipPathToId, clip.zipPath, clip.name, media)}</clipitem>`
}

function audioClipItemXml(clip: AudioClipPlan, clipId: string, fileId: string, zipPathToId: Map<string, string>): string {
  const startFrames = secondsToFrames(clip.startSec)
  const durationFrames = secondsToFrames(clip.durationSec)
  const endFrames = startFrames + durationFrames
  const sourceInFrames = secondsToFrames(clip.sourceInSec)
  const sourceOutFrames = sourceInFrames + durationFrames
  const media = `<media><audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>1</channelcount></audio></media>`
  return `<clipitem id="${clipId}"><name>${xmlEscape(clip.name)}</name><enabled>TRUE</enabled><duration>${sourceOutFrames}</duration><rate><timebase>${TIMEBASE}</timebase><ntsc>FALSE</ntsc></rate><start>${startFrames}</start><end>${endFrames}</end><in>${sourceInFrames}</in><out>${sourceOutFrames}</out>${fileBlock(fileId, zipPathToId, clip.zipPath, clip.name, media)}</clipitem>`
}

function buildSequenceXml(episode: Episode, plan: ExportPlan): string {
  const { width, height } = dimensionsForFormat(episode.format)
  const totalFrames = secondsToFrames(episode.length)
  const zipPathToId = new Map<string, string>()
  let clipCounter = 0
  let fileCounter = 0
  const nextClipId = () => `clipitem-${++clipCounter}`
  const nextFileId = () => `file-${++fileCounter}`

  const videoClipItems = plan.videoClips.map((c) => videoClipItemXml(c, nextClipId(), nextFileId(), zipPathToId)).join('')
  const musicClipItems = plan.musicClips.map((c) => audioClipItemXml(c, nextClipId(), nextFileId(), zipPathToId)).join('')
  const sfxClipItems = plan.sfxClips.map((c) => audioClipItemXml(c, nextClipId(), nextFileId(), zipPathToId)).join('')

  const markersXml = plan.markers
    .map((m) => {
      const inFrames = secondsToFrames(m.startSec)
      const outFrames = inFrames + secondsToFrames(m.durationSec)
      return `<marker><comment>${xmlEscape(m.comment)}</comment><name>${xmlEscape(m.name)}</name><in>${inFrames}</in><out>${outFrames}</out></marker>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
<sequence id="sequence-1">
<uuid>${crypto.randomUUID()}</uuid>
<duration>${totalFrames}</duration>
<rate><timebase>${TIMEBASE}</timebase><ntsc>FALSE</ntsc></rate>
<name>${xmlEscape(episode.title)}</name>
<media>
<video>
<format><samplecharacteristics><rate><timebase>${TIMEBASE}</timebase><ntsc>FALSE</ntsc></rate><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>
<track>${videoClipItems}<enabled>TRUE</enabled><locked>FALSE</locked></track>
</video>
<audio>
<numOutputChannels>2</numOutputChannels>
<format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>
<track>${musicClipItems}<enabled>TRUE</enabled><locked>FALSE</locked></track>
<track>${sfxClipItems}<enabled>TRUE</enabled><locked>FALSE</locked></track>
</audio>
</media>
<timecode><rate><timebase>${TIMEBASE}</timebase><ntsc>FALSE</ntsc></rate><string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
${markersXml}
</sequence>
</xmeml>
`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const README = `Director OS — Premiere Pro export
=================================

1. Unzip this folder somewhere on disk (keep the .xml next to the media/ folder — the XML references media/ by a relative path).
2. In Premiere Pro: File > Import... and choose the .xml file. Premiere creates a new sequence with everything already placed at the planned timing.
3. If any clip shows as "Media Offline", right-click it > Link Media..., and point it at the media/ folder in this same unzipped bundle — Premiere will auto-relink the rest of the offline clips in that folder in one step.

What's in the sequence:
- Video track: every scene's storyboard image (or a generated placeholder for scenes with no uploaded photo yet), with its on-screen text already baked in — swap the image for real footage and the text carries over as long as you keep the frame, or re-add it as a title if you cut it.
- Audio track 1: music, at its planned offset/trim.
- Audio track 2: SFX, at their planned offsets.
- A marker on every scene with its dialogue and notes — open the Markers panel to read them while you cut.
`

export async function exportEpisodeToPremiere(episode: Episode, project: Project): Promise<void> {
  const plan = await buildExportPlan(episode)
  const xml = buildSequenceXml(episode, plan)

  const zip = new JSZip()
  const baseName = sanitizeFilename(`${project.name}-${episode.title}`)
  zip.file(`${baseName}.xml`, xml)
  zip.file('README.txt', README)
  for (const file of plan.mediaFiles) {
    zip.file(file.zipPath, file.blob)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
