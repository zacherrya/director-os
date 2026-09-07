/**
 * Publishing a Reel.
 *
 * Four steps, and the middle two are where it goes wrong if you rush it:
 *
 *   1. Open a container (`upload_type=resumable`)
 *   2. Stream the video into it — Rust, so the file never enters the webview
 *   3. Poll until Meta says FINISHED. Publishing early returns a bare 400.
 *   4. Publish, then post the first comment as a separate call
 *
 * Step 3 is not optional politeness. Meta transcodes after receiving the file,
 * and the container is not publishable until that finishes; the docs are explicit
 * that calling publish too early fails.
 *
 * CURRENTLY UNUSED. Kept intact rather than deleted: the pipeline is complete
 * and correct, and only the Meta connection is missing. Reaching it again means
 * a Meta app on the Facebook Login path, or switching to `video_url` publishing
 * with the file staged somewhere public.
 */

import { invoke } from '@tauri-apps/api/core'
import { GRAPH_VERSION, graphGet, graphPost } from './metaAuth'
import { getInstagramPageToken, getInstagramUserId } from './credentials'

/** Meta's own guidance: once a minute, and give up after five. */
const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 5 * 60_000

export type PublishStage =
  | 'creating'
  | 'uploading'
  | 'processing'
  | 'publishing'
  | 'commenting'
  | 'done'

export const STAGE_LABEL: Record<PublishStage, string> = {
  creating: 'Opening an upload…',
  uploading: 'Sending the video…',
  processing: 'Instagram is processing it…',
  publishing: 'Publishing…',
  commenting: 'Posting the first comment…',
  done: 'Published.',
}

export interface PublishRequest {
  filePath: string
  caption: string
  firstComment: string
  /** Reels also appearing on the main profile grid. */
  shareToFeed: boolean
  onStage?: (stage: PublishStage) => void
}

export interface PublishResult {
  mediaId: string
  /** The real post URL, read back from Meta. */
  permalink?: string
  /** Set when the reel published but its first comment did not. */
  commentError?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function publishReel(req: PublishRequest): Promise<PublishResult> {
  const token = getInstagramPageToken()
  const igUserId = getInstagramUserId()
  if (!token || !igUserId) {
    throw new Error('Instagram publishing is not connected. Connect it in Settings → Instagram.')
  }

  const stage = (s: PublishStage) => req.onStage?.(s)

  // 1. Container.
  stage('creating')
  const container = await graphPost<{ id: string }>(
    `/${igUserId}/media`,
    {
      media_type: 'REELS',
      upload_type: 'resumable',
      caption: req.caption,
      share_to_feed: req.shareToFeed ? 'true' : 'false',
    },
    token,
  )
  if (!container.id) throw new Error('Instagram did not return an upload container.')

  // 2. The bytes.
  stage('uploading')
  await invoke('instagram_upload_binary', {
    accessToken: token,
    apiVersion: GRAPH_VERSION,
    containerId: container.id,
    filePath: req.filePath,
  })

  // 3. Wait for transcoding.
  stage('processing')
  const deadline = Date.now() + POLL_TIMEOUT_MS
  for (;;) {
    const status = await graphGet<{ status_code?: string; status?: string }>(
      `/${container.id}`,
      { fields: 'status_code,status' },
      token,
    )
    if (status.status_code === 'FINISHED') break
    if (status.status_code === 'ERROR') {
      throw new Error(status.status ?? 'Instagram could not process that video.')
    }
    if (Date.now() > deadline) {
      throw new Error(
        'Instagram is still processing this video after five minutes. It may still publish on its own — check the app before trying again, so you do not post it twice.',
      )
    }
    await sleep(POLL_INTERVAL_MS)
  }

  // 4. Publish.
  stage('publishing')
  const published = await graphPost<{ id: string }>(
    `/${igUserId}/media_publish`,
    { creation_id: container.id },
    token,
  )
  if (!published.id) throw new Error('Instagram accepted the video but returned no media id.')

  // The media id is not the shortcode in a post's URL, so the permalink has to
  // be read back rather than assembled. Not worth failing the publish over.
  let permalink: string | undefined
  try {
    const meta = await graphGet<{ permalink?: string }>(
      `/${published.id}`,
      { fields: 'permalink' },
      token,
    )
    permalink = meta.permalink
  } catch {
    permalink = undefined
  }

  // The first comment is a separate call, and failing it must not read as the
  // whole publish failing — the reel is already live at this point.
  if (req.firstComment.trim()) {
    stage('commenting')
    try {
      await graphPost(`/${published.id}/comments`, { message: req.firstComment.trim() }, token)
    } catch (err) {
      return {
        mediaId: published.id,
        permalink,
        commentError: err instanceof Error ? err.message : 'The first comment did not post.',
      }
    }
  }

  stage('done')
  return { mediaId: published.id, permalink }
}
