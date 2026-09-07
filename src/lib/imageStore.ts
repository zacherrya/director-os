/**
 * Keeps scene images out of localStorage.
 *
 * They used to be persisted as base64 data URLs inside the workspace JSON. A
 * single 1024x1536 still measures up to ~6.9MB that way, so a handful of them
 * exhausted the whole localStorage quota — and because the save had no error
 * handling, the failure was silent and every later save failed too.
 *
 * Now the bytes live in IndexedDB (same store the uploaded music uses) and the
 * workspace JSON carries only an id, exactly like `musicFileId`. Images are also
 * re-encoded to JPEG and capped on the long edge, which took the same test
 * frame from 6.9MB to 1.3MB before it even reaches storage.
 */

import { putFile, resolveFileUrl } from './fileStore'

function newImageFileId() {
  return `imagefile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Long-edge cap. Comfortably above 1080p export needs, far below original AI output. */
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.85

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode that image.'))
    img.src = src
  })
}

/** Downscales to MAX_EDGE and re-encodes as JPEG. */
export async function encodeForStorage(src: string): Promise<Blob> {
  const img = await loadImage(src)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.round(img.naturalWidth * scale)
  const height = Math.round(img.naturalHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  // JPEG has no alpha; fill first so any transparency lands on white rather than black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode that image.'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

/**
 * Normalises an image and puts it in IndexedDB.
 * Returns the durable id plus a blob: URL usable immediately this session.
 */
export async function storeSceneImage(src: string): Promise<{ fileId: string; url: string }> {
  const blob = await encodeForStorage(src)
  const fileId = newImageFileId()
  await putFile(fileId, blob)
  return { fileId, url: URL.createObjectURL(blob) }
}

export { resolveFileUrl }
