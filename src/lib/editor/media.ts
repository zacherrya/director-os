/**
 * Getting footage into the editor.
 *
 * On the desktop, footage is picked with the native chooser and referenced by
 * path — it streams from disk through the asset protocol and is never copied.
 * In a plain browser (development, and the preview harness) there is no path to
 * keep, so files become session-only object URLs and the source is marked as
 * such; they go offline on reload and the insights say so.
 *
 * Probing uses Mediabunny rather than a <video> element: the element reports a
 * duration, but not reliably whether there is an audio track, and it cannot tell
 * a rotated phone clip's display size from its coded size before it has played.
 */

import { invoke } from '@tauri-apps/api/core'
import { ALL_FORMATS, BlobSource, Input, UrlSource } from 'mediabunny'
import { videoSrc } from '../projectFolder'
import type { EditSource } from './model'

export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|gif)$/i
const fileName = (p: string) => p.split('/').pop() ?? p

/** Session cache of asset-protocol URLs; the grant has to be made once per launch. */
const granted = new Map<string, string | null>()

/** A URL the webview can load for a source, or null when it is offline. */
export async function sourceUrl(source: EditSource): Promise<string | null> {
  if (source.path && isDesktop()) {
    if (!granted.has(source.path)) granted.set(source.path, await videoSrc(source.path))
    return granted.get(source.path) ?? null
  }
  return source.url ?? null
}

async function probeVideo(input: Input): Promise<Pick<EditSource, 'duration' | 'width' | 'height' | 'hasAudio'>> {
  const [video, audio, duration] = await Promise.all([
    input.getPrimaryVideoTrack(),
    input.getPrimaryAudioTrack(),
    input.computeDuration(),
  ])
  if (!video) throw new Error('No video track.')
  return {
    duration,
    width: await video.getDisplayWidth(),
    height: await video.getDisplayHeight(),
    hasAudio: Boolean(audio),
  }
}

async function probeImage(url: string): Promise<{ width: number; height: number }> {
  const img = new Image()
  img.src = url
  await img.decode()
  return { width: img.naturalWidth, height: img.naturalHeight }
}

async function describe(url: string, kind: EditSource['kind'], open: () => Input) {
  if (kind === 'image') return { ...(await probeImage(url)), duration: 0, hasAudio: false }
  const input = open()
  try {
    return await probeVideo(input)
  } finally {
    input.dispose()
  }
}

export interface ImportResult {
  sources: EditSource[]
  /** Files that could not be read, with the reason. */
  failed: { name: string; reason: string }[]
}

/** Opens the chooser and describes whatever was picked. */
export async function importMedia(): Promise<ImportResult> {
  const result: ImportResult = { sources: [], failed: [] }

  if (isDesktop()) {
    const paths = await invoke<string[]>('pick_media', { prompt: 'Add footage and stills' })
    for (const path of paths) {
      const name = fileName(path)
      try {
        const url = await sourceUrl({ id: '', name, kind: 'video', path, duration: 0, width: 0, height: 0, hasAudio: false })
        if (!url) throw new Error('The file could not be opened.')
        const kind = IMAGE_EXT.test(path) ? 'image' : 'video'
        const info = await describe(url, kind, () => new Input({ formats: ALL_FORMATS, source: new UrlSource(url) }))
        result.sources.push({ id: crypto.randomUUID(), name, kind, path, ...info })
      } catch (err) {
        result.failed.push({ name, reason: err instanceof Error ? err.message : 'Unreadable.' })
      }
    }
    return result
  }

  const files = await new Promise<File[]>((resolve) => {
    const el = document.createElement('input')
    el.type = 'file'
    el.multiple = true
    el.accept = 'video/*,image/*'
    el.onchange = () => resolve([...(el.files ?? [])])
    el.click()
  })
  for (const file of files) {
    try {
      const kind = file.type.startsWith('image/') || IMAGE_EXT.test(file.name) ? 'image' : 'video'
      const url = URL.createObjectURL(file)
      const info = await describe(url, kind, () => new Input({ formats: ALL_FORMATS, source: new BlobSource(file) }))
      result.sources.push({ id: crypto.randomUUID(), name: file.name, kind, url, ...info })
    } catch (err) {
      result.failed.push({ name: file.name, reason: err instanceof Error ? err.message : 'Unreadable.' })
    }
  }
  return result
}

/** Saves a finished render. Desktop writes to a path chosen up front; a browser downloads. */
export async function chooseExportPath(suggestedName: string): Promise<string | null | 'download'> {
  if (!isDesktop()) return 'download'
  return invoke<string | null>('pick_export_path', { suggestedName })
}

export async function writeExport(bytes: Uint8Array, suggestedName: string): Promise<string> {
  if (isDesktop()) return invoke<string>('write_export', bytes)
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'video/mp4' }))
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return suggestedName
}
