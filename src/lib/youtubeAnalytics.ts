/**
 * YouTube Analytics API client — the things an API key cannot reach.
 *
 * Three reports matter here:
 *
 * 1. Traffic mix (`insightTrafficSourceType`) — where a video's views came from.
 * 2. The neighbourhood (`insightTrafficSourceDetail` filtered to RELATED_VIDEO)
 *    — the video IDs that actually *sent* viewers. Note this is not the same as
 *    "what YouTube shows beside your video": `search.list?relatedToVideoId` was
 *    switched off in August 2023 and nothing replaced it. What we get is better
 *    evidence anyway — it only counts suggestions that worked.
 * 3. Retention (`elapsedVideoTimeRatio`) — the real drop-off curve, which is
 *    what `retention.ts` has been approximating from a single average.
 *
 * Both detail reports carry awkward, non-obvious requirements that the API
 * rejects rather than defaults: the detail report demands `maxResults` and an
 * explicit `sort`, and the retention report takes exactly one video — no
 * comma-separated list.
 */

import { fetch } from '@tauri-apps/plugin-http'
import { getAccessToken } from './googleAuth'

const BASE = 'https://youtubeanalytics.googleapis.com/v2/reports'

/** Traffic source buckets, in the order they're worth reading. */
export const TRAFFIC_LABELS: Record<string, string> = {
  RELATED_VIDEO: 'Suggested videos',
  YT_SEARCH: 'YouTube search',
  SUBSCRIBER: 'Browse & subscriptions',
  SHORTS: 'Shorts feed',
  EXT_URL: 'External links',
  NOTIFICATION: 'Notifications',
  PLAYLIST: 'Playlists',
  YT_CHANNEL: 'Your channel page',
  END_SCREEN: 'End screens',
  HASHTAGS: 'Hashtag pages',
  SOUND_PAGE: 'Shorts sound pages',
  NO_LINK_OTHER: 'Direct or unknown',
  NO_LINK_EMBEDDED: 'Embedded players',
  YT_OTHER_PAGE: 'Other YouTube pages',
  ADVERTISING: 'Advertising',
  PROMOTED: 'Promotions',
  ANNOTATION: 'Annotations',
  CAMPAIGN_CARD: 'Campaign cards',
  LIVE_REDIRECT: 'Live redirects',
  PRODUCT_PAGE: 'Product pages',
  VIDEO_REMIXES: 'Remixes',
  WATCH_WITH: 'Watch With',
}

export function trafficLabel(type: string): string {
  return TRAFFIC_LABELS[type] ?? type
}

interface ReportResponse {
  columnHeaders?: { name: string }[]
  rows?: (string | number)[][]
  error?: { message?: string; code?: number; errors?: { reason?: string }[] }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Analytics data lags real time; asking up to today just returns empty tail days. */
export function defaultWindow(days = 365): { startDate: string; endDate: string } {
  const end = new Date()
  end.setDate(end.getDate() - 2)
  const start = new Date(end)
  start.setDate(start.getDate() - days)
  return { startDate: isoDate(start), endDate: isoDate(end) }
}

/**
 * A video's whole life, the way Studio's retention view reports it.
 *
 * A rolling year is right for traffic sources but wrong for retention: a video
 * published two years ago earned most of its watch time before that window
 * opens, so the query comes back empty even though Studio shows a full curve.
 *
 * The start date is taken from the video itself rather than some fixed early
 * date. A range starting long before the channel existed gets nothing back —
 * that was measured, not assumed: reaching back to YouTube's founding date
 * turned a working curve into an empty one.
 */
export function windowSincePublished(publishedAt: string): { startDate: string; endDate: string } {
  const end = new Date()
  end.setDate(end.getDate() - 2)

  const published = new Date(publishedAt)
  const start = new Date(Number.isNaN(published.getTime()) ? end : published)
  if (Number.isNaN(published.getTime())) start.setDate(start.getDate() - 365)
  else start.setDate(start.getDate() - 1)

  // Nothing has settled for a video published in the last day or two; clamp so
  // the range can never come out inverted.
  if (start > end) return { startDate: isoDate(end), endDate: isoDate(end) }
  return { startDate: isoDate(start), endDate: isoDate(end) }
}

async function queryReport(params: Record<string, string>): Promise<ReportResponse> {
  const token = await getAccessToken()
  const url = new URL(BASE)
  url.searchParams.set('ids', 'channel==MINE')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await res.text()

  let body: ReportResponse
  try {
    body = JSON.parse(text) as ReportResponse
  } catch {
    throw new Error(`YouTube Analytics returned a non-JSON response (HTTP ${res.status}).`)
  }

  if (!res.ok || body.error) {
    const reason = body.error?.errors?.[0]?.reason
    if (res.status === 403 || reason === 'forbidden') {
      throw new Error(
        'The Google account you authorized does not own this channel. Reconnect in Settings using the account that manages it.',
      )
    }
    if (res.status === 401) {
      throw new Error('Google rejected the saved permission. Reconnect YouTube Analytics in Settings.')
    }
    throw new Error(body.error?.message ?? `YouTube Analytics request failed (HTTP ${res.status}).`)
  }
  return body
}

/** Maps a report's rows onto its column headers so callers stop counting indexes. */
function asRecords(body: ReportResponse): Record<string, string | number>[] {
  const headers = (body.columnHeaders ?? []).map((h) => h.name)
  return (body.rows ?? []).map((row) => {
    const out: Record<string, string | number> = {}
    headers.forEach((h, i) => {
      out[h] = row[i]
    })
    return out
  })
}

export interface TrafficSlice {
  type: string
  label: string
  views: number
  minutesWatched: number
  /** Share of this video's (or channel's) views, 0-1. */
  share: number
}

/**
 * Where the views came from. Omit `videoId` for the whole channel.
 *
 * `video` is a filter rather than a dimension here — the API does not accept
 * `video` and `insightTrafficSourceType` as dimensions together, so per-video
 * breakdowns cost one request each.
 */
export async function fetchTrafficMix(
  videoId?: string,
  window = defaultWindow(),
): Promise<TrafficSlice[]> {
  const params: Record<string, string> = {
    ...window,
    metrics: 'views,estimatedMinutesWatched',
    dimensions: 'insightTrafficSourceType',
    sort: '-views',
  }
  if (videoId) params.filters = `video==${videoId}`

  const rows = asRecords(await queryReport(params))
  const total = rows.reduce((n, r) => n + Number(r.views ?? 0), 0)

  return rows
    .map((r) => {
      const views = Number(r.views ?? 0)
      const type = String(r.insightTrafficSourceType ?? '')
      return {
        type,
        label: trafficLabel(type),
        views,
        minutesWatched: Number(r.estimatedMinutesWatched ?? 0),
        share: total > 0 ? views / total : 0,
      }
    })
    .sort((a, b) => b.views - a.views)
}

export interface Referrer {
  /** The video that sent the traffic. */
  videoId: string
  views: number
  minutesWatched: number
}

/**
 * The videos whose watch pages sent viewers here, best first.
 *
 * `maxResults` and `sort` are both mandatory on this report — omitting either is
 * a hard error rather than a default.
 */
export async function fetchNeighbourhood(
  videoId?: string,
  window = defaultWindow(),
  limit = 25,
): Promise<Referrer[]> {
  const filters = ['insightTrafficSourceType==RELATED_VIDEO']
  if (videoId) filters.unshift(`video==${videoId}`)

  const rows = asRecords(
    await queryReport({
      ...window,
      metrics: 'views,estimatedMinutesWatched',
      dimensions: 'insightTrafficSourceDetail',
      filters: filters.join(';'),
      sort: '-views',
      maxResults: String(Math.min(limit, 25)),
    }),
  )

  return rows.map((r) => ({
    videoId: String(r.insightTrafficSourceDetail ?? ''),
    views: Number(r.views ?? 0),
    minutesWatched: Number(r.estimatedMinutesWatched ?? 0),
  })).filter((r) => r.videoId.length > 0)
}

export interface RetentionPoint {
  /** 0-1 through the video. */
  position: number
  /**
   * Share of viewers watching at that point. Can exceed 1: YouTube counts a
   * segment more than once when someone rewinds and rewatches it, which is
   * exactly the signal that marks a video's strongest moments.
   */
  watching: number
  /** Times this segment was the last one seen in a playback — where people leave. */
  stopped: number | null
  /** Times this segment was the first one seen — skip-ins and shares landing mid-video. */
  started: number | null
}

export interface RetentionCurve {
  points: RetentionPoint[]
  /**
   * Percentile against all YouTube videos of similar length, 0-1, where 0.5 is
   * the median. Note this is *not* the "150% of average" figure Studio shows —
   * the API returns a rank, so it renders as "better than 72% of similar videos".
   * Null when YouTube has too little data to place it.
   */
  relativePerformance: number | null
}

/**
 * The real drop-off curve. One video per request — this report explicitly
 * refuses a comma-separated video filter.
 */
export async function fetchRetentionCurve(
  videoId: string,
  window: { startDate: string; endDate: string },
): Promise<RetentionCurve> {
  const base = {
    ...window,
    dimensions: 'elapsedVideoTimeRatio',
    filters: `video==${videoId}`,
    sort: 'elapsedVideoTimeRatio',
  }

  // Ask for everything, then degrade to the bare curve.
  //
  // The extra metrics are the fragile ones. `relativeRetentionPerformance` needs
  // enough comparable videos before YouTube will rank a video at all, and
  // startedWatching/stoppedWatching are withheld more often than the curve is —
  // critically, an unavailable metric can come back as an *empty result set*
  // rather than an error, which silently loses a curve that does exist. So an
  // empty response is treated exactly like a rejection.
  const attempt = async (metrics: string) => asRecords(await queryReport({ ...base, metrics }))

  let rows: Record<string, string | number>[] = []
  try {
    rows = await attempt('audienceWatchRatio,relativeRetentionPerformance,startedWatching,stoppedWatching')
  } catch {
    rows = []
  }
  // Deliberately not wrapped: if the plain curve fails too, that error is the
  // real explanation and the caller should show it rather than a guess.
  if (rows.length === 0) rows = await attempt('audienceWatchRatio')

  const optional = (v: string | number | undefined) => (v === undefined ? null : Number(v))

  const points = rows
    .map((r) => ({
      position: Number(r.elapsedVideoTimeRatio ?? 0),
      watching: Number(r.audienceWatchRatio ?? 0),
      stopped: optional(r.stoppedWatching),
      started: optional(r.startedWatching),
    }))
    .sort((a, b) => a.position - b.position)

  const relatives = rows
    .map((r) => Number(r.relativeRetentionPerformance))
    .filter((v) => Number.isFinite(v))
  const relativePerformance =
    relatives.length > 0 ? relatives.reduce((a, b) => a + b, 0) / relatives.length : null

  return { points, relativePerformance }
}
