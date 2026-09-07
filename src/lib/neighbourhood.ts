/**
 * Where YouTube currently files you, versus where you want to be filed.
 *
 * The input is the set of videos that actually sent you suggested traffic. Those
 * get grouped by channel, because "you keep being suggested next to this channel"
 * is both how the algorithm behaves and how a creator thinks. You then mark each
 * channel on-target or off-target — the one judgement the app cannot make for
 * you, since nothing in the data says which audience you are reaching *for*.
 *
 * Everything downstream is a comparison between your videos and the on-target
 * ones across the levers you can actually change: title, description opener and
 * length. Thumbnails need vision and are handled in the AI pass; the spoken
 * opening comes from your own scripts, which are already in the app.
 *
 * Sample-size honesty applies as everywhere else: a "pattern" drawn from two
 * videos is one video and a coincidence.
 */

import type { PublicVideo } from './youtube'
import type { Referrer } from './youtubeAnalytics'

/** Below this many videos, a channel's title pattern isn't a pattern. */
export const MIN_VIDEOS_FOR_PATTERN = 4
/** Below this share of tagged traffic, the alignment score is too partial to show. */
export const MIN_TAGGED_SHARE = 0.5

export type ChannelVerdict = 'on' | 'off'
/** Persisted per channel id. Absent means the creator hasn't judged it yet. */
export type ChannelTags = Record<string, ChannelVerdict>

export interface NeighbourChannel {
  channelId: string
  channelTitle: string
  /** Views this channel's videos sent you. */
  views: number
  /** Share of all suggested traffic, 0-1. */
  share: number
  videos: PublicVideo[]
  verdict: ChannelVerdict | undefined
}

export interface Neighbourhood {
  channels: NeighbourChannel[]
  totalViews: number
  /** Referrer ids we couldn't hydrate — deleted, private or age-restricted. */
  unresolved: number
}

export function buildNeighbourhood(
  referrers: Referrer[],
  videos: PublicVideo[],
  tags: ChannelTags,
): Neighbourhood {
  const byId = new Map(videos.map((v) => [v.id, v]))
  const groups = new Map<string, NeighbourChannel>()
  let totalViews = 0
  let unresolved = 0

  for (const ref of referrers) {
    const video = byId.get(ref.videoId)
    if (!video) {
      unresolved++
      continue
    }
    totalViews += ref.views

    const existing = groups.get(video.channelId)
    if (existing) {
      existing.views += ref.views
      existing.videos.push(video)
    } else {
      groups.set(video.channelId, {
        channelId: video.channelId,
        channelTitle: video.channelTitle,
        views: ref.views,
        share: 0,
        videos: [video],
        verdict: tags[video.channelId],
      })
    }
  }

  const channels = [...groups.values()]
    .map((c) => ({ ...c, share: totalViews > 0 ? c.views / totalViews : 0 }))
    .sort((a, b) => b.views - a.views)

  return { channels, totalViews, unresolved }
}

export interface Alignment {
  /** Share of *judged* traffic coming from on-target channels, 0-1. */
  score: number
  onTargetViews: number
  offTargetViews: number
  untaggedViews: number
  /** Share of all suggested traffic that has been judged either way, 0-1. */
  coverage: number
  /** Enough of the neighbourhood is tagged for the score to mean something. */
  reliable: boolean
}

export function scoreAlignment(n: Neighbourhood): Alignment {
  let on = 0
  let off = 0
  let untagged = 0
  for (const c of n.channels) {
    if (c.verdict === 'on') on += c.views
    else if (c.verdict === 'off') off += c.views
    else untagged += c.views
  }
  const judged = on + off
  const coverage = n.totalViews > 0 ? judged / n.totalViews : 0
  return {
    score: judged > 0 ? on / judged : 0,
    onTargetViews: on,
    offTargetViews: off,
    untaggedViews: untagged,
    coverage,
    reliable: judged > 0 && coverage >= MIN_TAGGED_SHARE,
  }
}

// --- lever profiles ---------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'it', 'this', 'that', 'these', 'those', 'i', 'you', 'your',
  'my', 'we', 'they', 'he', 'she', 'at', 'by', 'from', 'as', 'how', 'what', 'why', 'when',
  'do', 'does', 'did', 'not', 'no', 'yes', 'can', 'will', 'would', 'should', 'about', 'out',
  'up', 'down', 'so', 'if', 'me', 'our', 'its', 'has', 'have', 'had', 'more', 'most', 'all',
])

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function share(values: boolean[]): number {
  if (values.length === 0) return 0
  return values.filter(Boolean).length / values.length
}

export interface LeverProfile {
  sampleSize: number
  titleWords: number | null
  titleChars: number | null
  /** Share of titles that ask a question. */
  questionShare: number
  /** Share of titles containing a digit. */
  numberShare: number
  /** Share of titles split by a colon, pipe or dash — "Topic: the payoff". */
  segmentedShare: number
  /** Share of titles shouting at least one word in capitals. */
  capsShare: number
  openerWords: number | null
  /** Share of description openers that lead with a link. */
  openerLinkShare: number
  durationSeconds: number | null
  /** Most-used content words in the titles, best first. */
  vocabulary: { word: string; count: number }[]
}

interface TitledItem {
  title: string
  descriptionOpener?: string
  duration?: number | null
}

export function profileLevers(items: TitledItem[]): LeverProfile {
  const titles = items.map((i) => i.title ?? '')
  const openers = items.map((i) => i.descriptionOpener ?? '').filter((o) => o.length > 0)
  const durations = items.map((i) => i.duration).filter((d): d is number => typeof d === 'number')

  const counts = new Map<string, number>()
  for (const t of titles) for (const w of words(t)) counts.set(w, (counts.get(w) ?? 0) + 1)

  return {
    sampleSize: items.length,
    titleWords: median(titles.map((t) => t.trim().split(/\s+/).filter(Boolean).length)),
    titleChars: median(titles.map((t) => t.length)),
    questionShare: share(titles.map((t) => t.trim().endsWith('?'))),
    numberShare: share(titles.map((t) => /\d/.test(t))),
    segmentedShare: share(titles.map((t) => /[:|–—]/.test(t))),
    capsShare: share(titles.map((t) => /\b[A-Z]{2,}\b/.test(t))),
    openerWords: median(openers.map((o) => o.trim().split(/\s+/).filter(Boolean).length)),
    openerLinkShare: share(openers.map((o) => /^https?:\/\//i.test(o.trim()))),
    durationSeconds: median(durations),
    vocabulary: [...counts.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
      .slice(0, 12),
  }
}

export interface LeverGap {
  lever: 'title' | 'description' | 'length' | 'vocabulary'
  /** What the on-target neighbourhood does. */
  theirs: string
  /** What you do. */
  yours: string
  /** Plain instruction, or null when the gap is only worth noting. */
  suggestion: string | null
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function plural(n: number, noun: string): string {
  const rounded = Math.round(n)
  return `${rounded} ${noun}${rounded === 1 ? '' : 's'}`
}

/**
 * Differences big enough to act on. Small gaps are dropped rather than padded
 * into findings — a list of eight trivial deltas reads as noise and gets ignored
 * along with the two that mattered.
 */
export function compareLevers(mine: LeverProfile, theirs: LeverProfile): LeverGap[] {
  const gaps: LeverGap[] = []
  if (mine.sampleSize < MIN_VIDEOS_FOR_PATTERN || theirs.sampleSize < MIN_VIDEOS_FOR_PATTERN) {
    return gaps
  }

  if (mine.titleWords !== null && theirs.titleWords !== null) {
    const delta = theirs.titleWords - mine.titleWords
    if (Math.abs(delta) >= 2) {
      gaps.push({
        lever: 'title',
        theirs: `${theirs.titleWords.toFixed(0)}-word titles`,
        yours: `${mine.titleWords.toFixed(0)}-word titles`,
        suggestion:
          delta > 0
            ? 'Their titles carry more detail than yours. Yours may be too terse to tell a stranger what they are about to get.'
            : 'Their titles are tighter than yours. Long titles get truncated in the suggested rail, so the payoff can be cut off.',
      })
    }
  }

  const structural: { key: keyof LeverProfile; label: string; advice: string }[] = [
    { key: 'questionShare', label: 'ask a question', advice: 'Posing the question in the title is what this audience clicks.' },
    { key: 'numberShare', label: 'use a number', advice: 'Numbers set an expectation of scope — "5 things", "under £30".' },
    { key: 'segmentedShare', label: 'split with a colon or dash', advice: 'A "Topic: the payoff" split gives the hook somewhere to live.' },
  ]

  for (const s of structural) {
    const t = theirs[s.key] as number
    const m = mine[s.key] as number
    if (t - m >= 0.35) {
      gaps.push({
        lever: 'title',
        theirs: `${pct(t)} ${s.label}`,
        yours: `${pct(m)} of yours do`,
        suggestion: s.advice,
      })
    }
  }

  if (mine.openerWords !== null && theirs.openerWords !== null && Math.abs(theirs.openerWords - mine.openerWords) >= 6) {
    gaps.push({
      lever: 'description',
      theirs: `${theirs.openerWords.toFixed(0)}-word opening line`,
      yours: plural(mine.openerWords, 'word'),
      suggestion:
        theirs.openerWords > mine.openerWords
          ? 'They use the first line to restate the promise. Only that line shows above the fold.'
          : 'They keep the first line short. Yours may be burying the point past what YouTube shows.',
    })
  }

  if (mine.openerLinkShare - theirs.openerLinkShare >= 0.4) {
    gaps.push({
      lever: 'description',
      theirs: `${pct(theirs.openerLinkShare)} open with a link`,
      yours: `${pct(mine.openerLinkShare)} of yours do`,
      suggestion: 'You are spending the one visible line on a URL. Put the promise there and move the link below.',
    })
  }

  if (mine.durationSeconds !== null && theirs.durationSeconds !== null && theirs.durationSeconds > 0) {
    const ratio = mine.durationSeconds / theirs.durationSeconds
    if (ratio <= 0.6 || ratio >= 1.7) {
      gaps.push({
        lever: 'length',
        theirs: `${Math.round(theirs.durationSeconds / 60)} min typical`,
        yours: `${Math.round(mine.durationSeconds / 60)} min`,
        suggestion:
          ratio < 1
            ? 'You are much shorter than the videos you are suggested beside, which caps how much watch time a suggestion can earn you.'
            : 'You run much longer than your neighbourhood, so a suggestion has to win more of a stranger\'s evening.',
      })
    }
  }

  // A word only counts as "their vocabulary" if it recurs — once across four
  // titles is a coincidence. The bar scales with the sample so a large
  // neighbourhood doesn't start reporting incidental words as a house style.
  const recurrence = Math.max(2, Math.ceil(theirs.sampleSize * 0.2))
  const mineWords = new Set(mine.vocabulary.map((v) => v.word))
  const missing = theirs.vocabulary
    .filter((v) => !mineWords.has(v.word) && v.count >= recurrence)
    .slice(0, 6)
  if (missing.length >= 3) {
    gaps.push({
      lever: 'vocabulary',
      theirs: missing.map((m) => m.word).join(', '),
      yours: mine.vocabulary.slice(0, 5).map((m) => m.word).join(', '),
      suggestion: 'These are the words the on-target neighbourhood titles with, and none of them appear in yours.',
    })
  }

  return gaps
}
