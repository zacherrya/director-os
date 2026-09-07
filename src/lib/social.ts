/** Normalized performance record, so Instagram and YouTube posts can be ranked
 * and analysed side by side. Any metric a platform doesn't report is `null`
 * rather than 0 — "not measured" and "measured as zero" mean different things
 * when you're deciding what to make next. */

export type SocialPlatform = 'instagram' | 'youtube'

export interface PostPerformance {
  id: string
  platform: SocialPlatform
  title: string
  permalink: string
  thumbnail?: string
  /** ISO 8601. */
  publishedAt: string
  /** Platform's own label: 'Reel', 'Post', 'Short', 'Video'. */
  format: string
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  /** Seconds. Instagram Reels only. */
  avgWatchTime: number | null
  /** Seconds. Total length of the video, when the platform reports it. */
  duration: number | null
}

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
}

/** Every interaction the platform actually reported, ignoring the ones it didn't. */
export function totalInteractions(p: PostPerformance): number {
  return (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0)
}

/** Interactions as a percentage of views. Null when views are unknown or zero —
 * a rate over an unknown denominator would rank posts on noise. */
export function engagementRate(p: PostPerformance): number | null {
  if (!p.views) return null
  return (totalInteractions(p) / p.views) * 100
}

export type RankMetric = 'views' | 'engagementRate' | 'likes' | 'comments' | 'shares' | 'saves'

export const RANK_METRICS: { value: RankMetric; label: string }[] = [
  { value: 'views', label: 'Views' },
  { value: 'engagementRate', label: 'Engagement rate' },
  { value: 'likes', label: 'Likes' },
  { value: 'comments', label: 'Comments' },
  { value: 'shares', label: 'Shares' },
  { value: 'saves', label: 'Saves' },
]

export function metricValue(p: PostPerformance, metric: RankMetric): number | null {
  if (metric === 'engagementRate') return engagementRate(p)
  return p[metric]
}

/** Sorts by the chosen metric, descending. Posts missing that metric sink to the
 * bottom instead of being treated as zero. */
export function rankPosts(posts: PostPerformance[], metric: RankMetric): PostPerformance[] {
  return [...posts].sort((a, b) => {
    const av = metricValue(a, metric)
    const bv = metricValue(b, metric)
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    return bv - av
  })
}

export function formatCount(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatSeconds(s: number | null): string {
  if (s === null) return '—'
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s % 60)}s`
}

export function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1mo ago' : `${months}mo ago`
}
