/**
 * YouTube client (Data API v3, API-key auth).
 *
 * Deliberately uses the public-statistics path rather than the YouTube Analytics
 * API: public stats need only an API key, while watch time, impressions and CTR
 * would require a full OAuth consent flow. Views, likes and comments are enough
 * to rank recent uploads, so the setup cost stays at "paste one key".
 *
 * The consequence is that `shares`, `saves` and `reach` are simply not reported
 * here, and stay null rather than being faked as zero.
 */

import { fetch } from '@tauri-apps/plugin-http'
import { getYouTubeChannel, getYouTubeKey } from './credentials'
import type { PostPerformance } from './social'

const BASE = 'https://www.googleapis.com/youtube/v3'

async function ytGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = getYouTubeKey()
  if (!key) throw new Error('YouTube is not connected. Add an API key in Settings.')

  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('key', key)

  const res = await fetch(url.toString(), { headers: { accept: 'application/json' } })
  const text = await res.text()

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`YouTube returned a non-JSON response (HTTP ${res.status}).`)
  }

  const err = (body as { error?: { message?: string; errors?: { reason?: string }[] } }).error
  if (!res.ok || err) {
    const reason = err?.errors?.[0]?.reason
    if (reason === 'quotaExceeded') {
      throw new Error("This API key's daily YouTube quota is used up. It resets at midnight Pacific.")
    }
    if (reason === 'keyInvalid' || reason === 'badRequest') {
      throw new Error('YouTube rejected the API key. Check it in Settings, and that YouTube Data API v3 is enabled for it.')
    }
    throw new Error(err?.message ?? `YouTube request failed (HTTP ${res.status}).`)
  }
  return body as T
}

/** Accepts a UC… channel id, an @handle, or a bare handle. */
function channelLookupParams(input: string): Record<string, string> {
  const value = input.trim()
  if (/^UC[\w-]{22}$/.test(value)) return { id: value }
  return { forHandle: value.startsWith('@') ? value : `@${value}` }
}

interface YtChannel {
  snippet?: { title?: string }
  statistics?: { subscriberCount?: string; videoCount?: string }
  contentDetails?: { relatedPlaylists?: { uploads?: string } }
}

async function resolveChannel(): Promise<{ title: string; subscribers: number | null; uploadsPlaylist: string }> {
  const channel = getYouTubeChannel()
  if (!channel) throw new Error('No YouTube channel set. Add one in Settings.')

  const res = await ytGet<{ items?: YtChannel[] }>('/channels', {
    part: 'snippet,statistics,contentDetails',
    ...channelLookupParams(channel),
  })
  const item = res.items?.[0]
  if (!item) throw new Error(`No YouTube channel found for "${channel}". Use the @handle or the UC… channel id.`)

  const uploads = item.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) throw new Error('That YouTube channel has no public uploads playlist.')

  const subs = item.statistics?.subscriberCount
  return {
    title: item.snippet?.title ?? channel,
    subscribers: subs === undefined ? null : Number(subs),
    uploadsPlaylist: uploads,
  }
}

/** Verifies the key + channel and returns the channel's display name. */
export async function fetchYouTubeAccount(): Promise<{ title: string; subscribers: number | null }> {
  const { title, subscribers } = await resolveChannel()
  return { title, subscribers }
}

/** "PT1M30S" → 90. */
function parseIsoDuration(iso: string | undefined): number | null {
  if (!iso) return null
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return null
  const [, d, h, min, s] = m
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0)
}

interface YtVideo {
  id?: string
  snippet?: {
    title?: string
    publishedAt?: string
    thumbnails?: Record<string, { url?: string }>
    description?: string
    tags?: string[]
    channelId?: string
    channelTitle?: string
  }
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
  contentDetails?: { duration?: string }
}

export async function fetchYouTubePosts(limit = 10): Promise<PostPerformance[]> {
  const { uploadsPlaylist } = await resolveChannel()

  const playlist = await ytGet<{ items?: { contentDetails?: { videoId?: string } }[] }>('/playlistItems', {
    part: 'contentDetails',
    playlistId: uploadsPlaylist,
    maxResults: String(Math.min(limit, 50)),
  })
  const ids = (playlist.items ?? []).map((i) => i.contentDetails?.videoId).filter((v): v is string => !!v)
  if (ids.length === 0) return []

  const videos = await ytGet<{ items?: YtVideo[] }>('/videos', {
    part: 'snippet,statistics,contentDetails',
    id: ids.join(','),
  })

  // Preserve the playlist's newest-first order; /videos does not guarantee it.
  const byId = new Map((videos.items ?? []).map((v) => [v.id, v]))

  return ids.flatMap((id): PostPerformance[] => {
    const v = byId.get(id)
    if (!v) return []
    const num = (s: string | undefined) => (s === undefined ? null : Number(s))
    const duration = parseIsoDuration(v.contentDetails?.duration)
    const thumbs = v.snippet?.thumbnails ?? {}

    return [{
      id,
      platform: 'youtube',
      title: v.snippet?.title ?? 'Untitled video',
      permalink: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: (thumbs.medium ?? thumbs.high ?? thumbs.default)?.url,
      publishedAt: v.snippet?.publishedAt ?? '',
      // The Data API has no Shorts flag; length is the only signal available.
      format: duration !== null && duration <= 60 ? 'Short' : 'Video',
      views: num(v.statistics?.viewCount),
      reach: null,
      likes: num(v.statistics?.likeCount),
      comments: num(v.statistics?.commentCount),
      shares: null,
      saves: null,
      avgWatchTime: null,
      duration,
    }]
  })
}

/** A video on someone else's channel, as far as public data goes. */
export interface PublicVideo {
  id: string
  title: string
  description: string
  /** The opening line of the description — the part that shows above the fold. */
  descriptionOpener: string
  tags: string[]
  channelId: string
  channelTitle: string
  publishedAt: string
  thumbnail: string | undefined
  views: number | null
  duration: number | null
}

function firstMeaningfulLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? ''
  return line.length > 200 ? `${line.slice(0, 197)}…` : line
}

/**
 * Hydrates arbitrary video IDs into public metadata.
 *
 * Used for the videos that send us suggested traffic, which live on other
 * people's channels — so this is deliberately limited to what the Data API
 * exposes publicly. Transcripts are not among it: `captions.download` only
 * works on videos you own.
 */
export async function fetchVideosByIds(ids: string[]): Promise<PublicVideo[]> {
  if (ids.length === 0) return []

  // /videos accepts 50 ids per call.
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50))

  const out: PublicVideo[] = []
  for (const batch of batches) {
    const res = await ytGet<{ items?: YtVideo[] }>('/videos', {
      part: 'snippet,statistics,contentDetails',
      id: batch.join(','),
    })
    for (const v of res.items ?? []) {
      if (!v.id) continue
      const thumbs = v.snippet?.thumbnails ?? {}
      const description = v.snippet?.description ?? ''
      out.push({
        id: v.id,
        title: v.snippet?.title ?? 'Untitled video',
        description,
        descriptionOpener: firstMeaningfulLine(description),
        tags: v.snippet?.tags ?? [],
        channelId: v.snippet?.channelId ?? '',
        channelTitle: v.snippet?.channelTitle ?? 'Unknown channel',
        publishedAt: v.snippet?.publishedAt ?? '',
        thumbnail: (thumbs.medium ?? thumbs.high ?? thumbs.default)?.url,
        views: v.statistics?.viewCount === undefined ? null : Number(v.statistics.viewCount),
        duration: parseIsoDuration(v.contentDetails?.duration),
      })
    }
  }
  return out
}
