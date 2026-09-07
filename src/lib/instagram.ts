/**
 * Instagram client (Instagram Login path, graph.instagram.com).
 *
 * Ported from the verified client in the workspace's `shivangi-instagram` project.
 * Two things that matter and are easy to get wrong:
 *
 * 1. Insight metrics are per media product type. Asking for a metric that isn't
 *    valid for that type is a hard error, not a null — so the metric list is
 *    chosen per type, and a failed insights call degrades that one post to
 *    "metrics unavailable" rather than failing the whole fetch.
 * 2. `impressions` and `plays` were sunset in April 2025 across all API versions.
 *    `views` replaced them.
 */

import { fetch } from '@tauri-apps/plugin-http'
import { getInstagramToken } from './credentials'
import type { PostPerformance } from './social'

const API_VERSION = 'v23.0'
const BASE = `https://graph.instagram.com/${API_VERSION}`

const MEDIA_METRICS = {
  REELS: [
    'views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions',
    'ig_reels_avg_watch_time',
  ],
  FEED: [
    'views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions',
  ],
} as const

interface IgMedia {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  thumbnail_url?: string
  media_url?: string
  permalink?: string
  timestamp?: string
}

function metricsFor(media: IgMedia): readonly string[] {
  return media.media_product_type === 'REELS' ? MEDIA_METRICS.REELS : MEDIA_METRICS.FEED
}

/** Strips the token out of anything we're about to show the user. */
function redact(message: string): string {
  const t = getInstagramToken()
  return t ? message.split(t).join('<token>') : message
}

async function igGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = getInstagramToken()
  if (!token) throw new Error('Instagram is not connected. Add an access token in Settings.')

  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token)

  const res = await fetch(url.toString(), { headers: { accept: 'application/json' } })
  const text = await res.text()

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`Instagram returned a non-JSON response (HTTP ${res.status}).`)
  }

  const err = (body as { error?: { message?: string; code?: number } }).error
  if (!res.ok || err) {
    const message = err?.message ?? `HTTP ${res.status}`
    if (err?.code === 190) {
      throw new Error('Instagram rejected the access token — it has expired or been revoked. Reconnect in Settings.')
    }
    throw new Error(redact(message))
  }
  return body as T
}

/** Flattens Meta's insight envelope into a plain { metric: number } object. */
function flattenInsights(payload: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  const rows = (payload as { data?: unknown[] })?.data ?? []
  for (const row of rows) {
    const r = row as { name?: string; total_value?: { value?: number }; values?: { value?: number }[] }
    if (!r.name) continue
    if (typeof r.total_value?.value === 'number') out[r.name] = r.total_value.value
    else if (Array.isArray(r.values)) {
      const last = r.values.at(-1)?.value
      if (typeof last === 'number') out[r.name] = last
    }
  }
  return out
}

function firstLine(caption: string | undefined, fallback: string): string {
  const line = (caption ?? '').split('\n').find((l) => l.trim().length > 0)?.trim()
  if (!line) return fallback
  return line.length > 90 ? `${line.slice(0, 87)}…` : line
}

/** Verifies the token and returns the connected account's handle. */
export async function fetchInstagramAccount(): Promise<{ username: string; followers: number | null }> {
  const me = await igGet<{ username?: string; followers_count?: number }>('/me', {
    fields: 'user_id,username,followers_count,media_count',
  })
  return {
    username: me.username ?? 'unknown',
    followers: typeof me.followers_count === 'number' ? me.followers_count : null,
  }
}

/**
 * Runs `worker` over every item, at most `width` in flight at once.
 *
 * Insights are one request per post, so a 50-post history fired off in a single
 * `Promise.all` is 50 simultaneous calls at Meta — enough to get throttled, and
 * rude besides. Results keep the input order.
 */
async function mapLimited<T, R>(items: T[], width: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(width, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await worker(items[i])
    }
  })
  await Promise.all(runners)
  return out
}

export async function fetchInstagramPosts(limit = 10): Promise<PostPerformance[]> {
  const list = await igGet<{ data?: IgMedia[] }>('/me/media', {
    fields: 'id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp',
    limit: String(limit),
  })
  const media = list.data ?? []

  // Insights are fetched per media and allowed to fail individually — one post
  // whose metrics are unavailable shouldn't cost us the other nine.
  return mapLimited(
    media,
    6,
    async (m): Promise<PostPerformance> => {
      let insights: Record<string, number> = {}
      try {
        const payload = await igGet('/' + m.id + '/insights', { metric: metricsFor(m).join(',') })
        insights = flattenInsights(payload)
      } catch {
        insights = {}
      }

      const isReel = m.media_product_type === 'REELS'
      const num = (k: string) => (typeof insights[k] === 'number' ? insights[k] : null)
      // Meta reports this one in milliseconds.
      const watchMs = num('ig_reels_avg_watch_time')

      return {
        id: m.id,
        platform: 'instagram',
        title: firstLine(m.caption, isReel ? 'Untitled reel' : 'Untitled post'),
        permalink: m.permalink ?? '',
        thumbnail: m.thumbnail_url ?? m.media_url,
        publishedAt: m.timestamp ?? '',
        format: isReel ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Post',
        views: num('views'),
        reach: num('reach'),
        likes: num('likes'),
        comments: num('comments'),
        shares: num('shares'),
        saves: num('saved'),
        avgWatchTime: watchMs === null ? null : watchMs / 1000,
        duration: null,
      }
    },
  )
}
