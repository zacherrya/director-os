/**
 * The finished cut attached to an episode.
 *
 * Three thin wrappers so the calendar never touches `invoke` directly. Revealing
 * is deliberately `open -R` on the Rust side — it selects the file in Finder
 * rather than launching it, which is both what you want before uploading and
 * one less way for a stored path to run something.
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core'

export async function pickCut(prompt: string, defaultDir?: string): Promise<string | null> {
  return invoke<string | null>('pick_file', { prompt, defaultDir: defaultDir ?? null })
}

export async function revealCut(path: string): Promise<void> {
  return invoke('reveal_in_finder', { path })
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>('path_exists', { path })
  } catch {
    return false
  }
}

/** "final_v3.mov" — the only part of a long path worth showing on a card. */
export function fileName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

/** The folder a cut came from, remembered so the next pick starts there. */
export function parentFolder(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')
  parts.pop()
  return parts.join('/')
}

/**
 * A URL the webview can actually load for an attached cut.
 *
 * Two steps, not one: the asset protocol's static scope is empty, so the file
 * has to be granted at runtime before `convertFileSrc` produces something that
 * will load. Returns null when the file has moved, so callers can fall back
 * rather than render a broken player.
 */
export async function videoSrc(path: string): Promise<string | null> {
  try {
    await invoke('allow_video', { path })
    return convertFileSrc(path)
  } catch {
    return null
  }
}
