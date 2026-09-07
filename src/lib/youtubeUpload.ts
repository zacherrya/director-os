/**
 * Publishing a finished cut to YouTube.
 *
 * The bytes never enter the webview — Rust streams the file straight into the
 * request. All this does is hand over a fresh access token, the path, and what
 * the video should say about itself.
 */

import { invoke } from '@tauri-apps/api/core'
import { getAccessToken } from './googleAuth'
import type { PublishDraft } from './publishDraft'

export type Privacy = 'private' | 'unlisted' | 'public'

/**
 * A handful of assignable categories rather than the full list.
 *
 * YouTube requires one on every upload — an insert without it is refused — and
 * most of the ~30 it offers are irrelevant to any given channel.
 */
export const CATEGORIES: { id: string; label: string }[] = [
  { id: '22', label: 'People & Blogs' },
  { id: '26', label: 'Howto & Style' },
  { id: '24', label: 'Entertainment' },
  { id: '27', label: 'Education' },
  { id: '1', label: 'Film & Animation' },
  { id: '10', label: 'Music' },
  { id: '20', label: 'Gaming' },
  { id: '17', label: 'Sport' },
  { id: '19', label: 'Travel & Events' },
]

export const DEFAULT_CATEGORY = '22'

/**
 * Turns a local date and time into the instant YouTube should publish at.
 *
 * Returns null when the moment has already passed — YouTube rejects a publishAt
 * in the past, and catching it here gives a better message than the API does.
 */
export function scheduleInstant(date: string, time: string): string | null {
  if (!date || !time) return null
  const when = new Date(`${date}T${time}:00`)
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return null
  return when.toISOString()
}

export const PRIVACY_OPTIONS: { value: Privacy; label: string; detail: string }[] = [
  {
    value: 'private',
    label: 'Private',
    detail: 'Only you can see it. Safest for a first upload — flip it public in Studio when you have checked it over.',
  },
  {
    value: 'unlisted',
    label: 'Unlisted',
    detail: 'Anyone with the link can watch, but it will not appear on your channel or in search.',
  },
  {
    value: 'public',
    label: 'Public',
    detail: 'Live immediately, and subscribers may be notified. This is the one that is hard to take back.',
  },
]

export interface UploadRequest {
  filePath: string
  draft: PublishDraft
  privacy: Privacy
  madeForKids: boolean
  categoryId: string
  /** ISO 8601. Requires `privacy` to be 'private'. */
  publishAt?: string
}

/** Resolves to the new video's id. */
export async function uploadToYouTube(req: UploadRequest): Promise<string> {
  const accessToken = await getAccessToken()

  return invoke<string>('youtube_upload', {
    accessToken,
    filePath: req.filePath,
    meta: {
      title: req.draft.title.trim(),
      description: req.draft.body.trim(),
      tags: req.draft.tags,
      privacy: req.privacy,
      made_for_kids: req.madeForKids,
      category_id: req.categoryId,
      publish_at: req.publishAt ?? null,
    },
  })
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}
