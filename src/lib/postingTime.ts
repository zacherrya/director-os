/**
 * Works out when this account should publish, from when it actually published
 * and how those posts did.
 *
 * Two things neither platform will tell us, and a note on what we do instead:
 *
 * 1. YouTube's "when your viewers are on YouTube" heatmap is a Studio-only
 *    feature. It is not in the Data API, and it is not in the YouTube Analytics
 *    API either — no OAuth scope unlocks it.
 * 2. Instagram's `online_followers` metric was retired by Meta and is not
 *    available on the Instagram Login path at all.
 *
 * So this measures the thing we can actually observe: your own results, by slot.
 * That is arguably the better signal anyway — "followers online" counts people
 * scrolling, not people who watched your video to the end.
 *
 * The one trap in a naive version of this is trend. On an account that is
 * growing, last month's posts have fewer views than this week's whatever time
 * they went out; on any account, older posts have had longer to accumulate.
 * Bucketing raw views would read both of those as timing effects. So every post
 * is scored against the posts published either side of it — its temporal
 * neighbours, which share the same account size and the same broad age — and it
 * is that index, not the raw count, that gets bucketed.
 */

import { engagementRate, type PostPerformance } from './social'

/** Below this many usable posts, no slot recommendation is offered at all. */
export const MIN_POSTS = 12
/** A weekday or time band needs this many posts before it can be ranked. */
export const MIN_PER_BUCKET = 3
/** And this many before the recommendation is called confident rather than early. */
export const FAIR_PER_BUCKET = 5
/** The best slot has to beat the account's own normal by this much to be worth acting on. */
export const MIN_LIFT = 0.15
/** Posts either side of a post that form its local baseline. */
const NEIGHBOURS = 4

/** Monday-first, to match the content calendar. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const WEEKDAY_FULL = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const

export const HOUR_BANDS = [
  { start: 0, label: '12–3am', full: 'overnight' },
  { start: 3, label: '3–6am', full: 'the small hours' },
  { start: 6, label: '6–9am', full: 'early morning' },
  { start: 9, label: '9am–12pm', full: 'late morning' },
  { start: 12, label: '12–3pm', full: 'midday' },
  { start: 15, label: '3–6pm', full: 'afternoon' },
  { start: 18, label: '6–9pm', full: 'evening' },
  { start: 21, label: '9pm–12am', full: 'late evening' },
] as const

/** JS getDay() is Sunday-first; the calendar and these labels are Monday-first. */
function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

function bandIndex(d: Date): number {
  return Math.floor(d.getHours() / 3)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

interface ScoredPost {
  post: PostPerformance
  when: Date
  weekday: number
  band: number
  /** Views as a multiple of what this post's contemporaries got. Null when it
   * has no usable neighbours to be measured against. */
  index: number | null
  engagement: number | null
}

/**
 * Scores each post against its temporal neighbours, so account growth and the
 * head start older posts have both fall out of the comparison.
 */
function scorePosts(posts: PostPerformance[]): ScoredPost[] {
  const dated = posts
    .map((post) => ({ post, when: new Date(post.publishedAt) }))
    .filter((p) => !Number.isNaN(p.when.getTime()))
    .sort((a, b) => a.when.getTime() - b.when.getTime())

  // Positions of the posts that actually reported a view count — the local
  // baseline is drawn from these, skipping over any gaps.
  const measurable = dated
    .map((p, i) => ({ i, views: p.post.views }))
    .filter((x): x is { i: number; views: number } => typeof x.views === 'number' && x.views > 0)

  const positionInMeasurable = new Map(measurable.map((m, rank) => [m.i, rank]))

  return dated.map((p, i) => {
    let index: number | null = null
    const rank = positionInMeasurable.get(i)

    if (rank !== undefined) {
      const from = Math.max(0, rank - NEIGHBOURS)
      const to = Math.min(measurable.length, rank + NEIGHBOURS + 1)
      const neighbourViews = measurable.slice(from, to).filter((_, k) => from + k !== rank).map((m) => m.views)
      // Two neighbours is the floor: a "median" of one is that one post.
      if (neighbourViews.length >= 2) {
        const local = median(neighbourViews)
        if (local && local > 0) index = measurable[rank].views / local
      }
    }

    return {
      post: p.post,
      when: p.when,
      weekday: weekdayIndex(p.when),
      band: bandIndex(p.when),
      index,
      engagement: engagementRate(p.post),
    }
  })
}

export interface TimingBucket {
  /** Index into WEEKDAY_LABELS or HOUR_BANDS. */
  key: number
  label: string
  sampleSize: number
  /** Median performance index — 1.0 means "exactly this account's normal". */
  medianIndex: number | null
  medianViews: number | null
  medianEngagement: number | null
  /** Enough posts here to be ranked against the other slots. */
  reliable: boolean
}

function bucketize(scored: ScoredPost[], keyOf: (s: ScoredPost) => number, count: number, labelOf: (k: number) => string): TimingBucket[] {
  const buckets: TimingBucket[] = []
  for (let k = 0; k < count; k++) {
    const inBucket = scored.filter((s) => keyOf(s) === k)
    const indices = inBucket.map((s) => s.index).filter((v): v is number => v !== null)
    const views = inBucket.map((s) => s.post.views).filter((v): v is number => v !== null)
    const rates = inBucket.map((s) => s.engagement).filter((v): v is number => v !== null)
    buckets.push({
      key: k,
      label: labelOf(k),
      sampleSize: inBucket.length,
      // The index needs the neighbour comparison, so it is gated on the count of
      // posts that got one, not on the raw bucket size.
      medianIndex: indices.length >= MIN_PER_BUCKET ? median(indices) : null,
      medianViews: median(views),
      medianEngagement: median(rates),
      reliable: indices.length >= MIN_PER_BUCKET,
    })
  }
  return buckets
}

export interface Slot {
  weekday: number
  band: number
  /** How much better than this account's normal, as a fraction: 0.4 = 40% better. */
  lift: number
  /** Both halves have a fair sample behind them, not just the bare minimum. */
  confident: boolean
}

export interface GridCell {
  weekday: number
  band: number
  sampleSize: number
  medianIndex: number | null
}

export type TimingVerdict =
  /** Enough history, and one slot genuinely stands out. */
  | 'recommend'
  /** Enough history, but no slot beats the others by enough to act on. */
  | 'no-signal'
  /** Everything went out in the same slot — nothing to compare it against. */
  | 'one-slot'
  /** Not enough published history yet. */
  | 'insufficient'

export interface TimingReport {
  verdict: TimingVerdict
  /** Posts with a usable publish date. */
  sampleSize: number
  /** Of those, the ones that could be scored against neighbours. */
  scoredSize: number
  byWeekday: TimingBucket[]
  byBand: TimingBucket[]
  grid: GridCell[]
  best: Slot | null
  /** The slot that has consistently underperformed, when there is one. */
  worst: { weekday: number | null; band: number | null } | null
  timezone: string
  /** Newest and oldest publish dates behind the report. */
  span: { from: string; to: string } | null
}

function bestOf(buckets: TimingBucket[]): TimingBucket | null {
  const ranked = buckets
    .filter((b): b is TimingBucket & { medianIndex: number } => b.reliable && b.medianIndex !== null)
    .sort((a, b) => b.medianIndex - a.medianIndex)
  return ranked[0] ?? null
}

function worstOf(buckets: TimingBucket[]): TimingBucket | null {
  const ranked = buckets
    .filter((b): b is TimingBucket & { medianIndex: number } => b.reliable && b.medianIndex !== null)
    .sort((a, b) => a.medianIndex - b.medianIndex)
  return ranked[0] ?? null
}

export function analyzePostingTime(posts: PostPerformance[]): TimingReport {
  const scored = scorePosts(posts)
  const withIndex = scored.filter((s) => s.index !== null)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const byWeekday = bucketize(scored, (s) => s.weekday, 7, (k) => WEEKDAY_LABELS[k])
  const byBand = bucketize(scored, (s) => s.band, HOUR_BANDS.length, (k) => HOUR_BANDS[k].label)

  const grid: GridCell[] = []
  for (let w = 0; w < 7; w++) {
    for (let b = 0; b < HOUR_BANDS.length; b++) {
      const cell = scored.filter((s) => s.weekday === w && s.band === b)
      const indices = cell.map((s) => s.index).filter((v): v is number => v !== null)
      grid.push({
        weekday: w,
        band: b,
        sampleSize: cell.length,
        medianIndex: indices.length >= MIN_PER_BUCKET ? median(indices) : null,
      })
    }
  }

  const span =
    scored.length > 0
      ? { from: scored[0].when.toISOString(), to: scored[scored.length - 1].when.toISOString() }
      : null

  const base: Omit<TimingReport, 'verdict' | 'best' | 'worst'> = {
    sampleSize: scored.length,
    scoredSize: withIndex.length,
    byWeekday,
    byBand,
    grid,
    timezone,
    span,
  }

  if (withIndex.length < MIN_POSTS) {
    return { ...base, verdict: 'insufficient', best: null, worst: null }
  }

  const rankableDays = byWeekday.filter((b) => b.reliable).length
  const rankableBands = byBand.filter((b) => b.reliable).length
  if (rankableDays < 2 && rankableBands < 2) {
    return { ...base, verdict: 'one-slot', best: null, worst: null }
  }

  const bestDay = bestOf(byWeekday)
  const bestBand = bestOf(byBand)
  const worst = {
    weekday: rankableDays >= 2 ? (worstOf(byWeekday)?.key ?? null) : null,
    band: rankableBands >= 2 ? (worstOf(byBand)?.key ?? null) : null,
  }

  // Each half is only allowed to contribute if its own dimension had something
  // to compare against — a "best day" picked from the single day you ever post
  // is not a finding.
  const dayLift = rankableDays >= 2 && bestDay?.medianIndex != null ? bestDay.medianIndex - 1 : 0
  const bandLift = rankableBands >= 2 && bestBand?.medianIndex != null ? bestBand.medianIndex - 1 : 0
  const lift = Math.max(dayLift, bandLift)

  if (lift < MIN_LIFT || (bestDay === null && bestBand === null)) {
    return { ...base, verdict: 'no-signal', best: null, worst }
  }

  return {
    ...base,
    verdict: 'recommend',
    worst,
    best: {
      weekday: dayLift >= MIN_LIFT && bestDay ? bestDay.key : -1,
      band: bandLift >= MIN_LIFT && bestBand ? bestBand.key : -1,
      lift,
      confident:
        (dayLift < MIN_LIFT || (bestDay?.sampleSize ?? 0) >= FAIR_PER_BUCKET) &&
        (bandLift < MIN_LIFT || (bestBand?.sampleSize ?? 0) >= FAIR_PER_BUCKET),
    },
  }
}

/** "Thursday evening", "Thursdays", "the evening" — whichever halves survived the gate. */
export function describeSlot(slot: Slot): string {
  const day = slot.weekday >= 0 ? WEEKDAY_FULL[slot.weekday] : null
  const band = slot.band >= 0 ? HOUR_BANDS[slot.band] : null
  if (day && band) return `${day}s, ${band.label}`
  if (day) return `${day}s`
  if (band) return `${band.label}`
  return 'no particular slot'
}

/** The next calendar date matching the recommended slot, for the content calendar. */
export function nextOccurrence(slot: Slot, from: Date = new Date()): Date | null {
  if (slot.weekday < 0) return null
  const target = new Date(from)
  const current = (target.getDay() + 6) % 7
  let delta = slot.weekday - current
  if (delta < 0) delta += 7
  target.setDate(target.getDate() + delta)
  target.setHours(slot.band >= 0 ? HOUR_BANDS[slot.band].start : 12, 0, 0, 0)
  if (target.getTime() <= from.getTime()) target.setDate(target.getDate() + 7)
  return target
}
