/**
 * Matches published posts back to the episodes they were planned from.
 *
 * Linking is what switches on every personalised check in the app, and doing it
 * by hand through a dropdown per post is exactly the chore nobody does. Most of
 * the work is guessable: a post's title usually still resembles the episode
 * title it came from, and it was published somewhere near when the episode was
 * scheduled.
 *
 * Deliberately proposes rather than applies. A wrong link silently poisons every
 * benchmark downstream, so each suggestion carries a score and waits for a human
 * to agree with it.
 */

import type { PostPerformance, SocialPlatform } from './social'
import type { Episode } from './types'

/** Below this, the titles have too little in common to be worth proposing. */
export const MIN_SCORE = 0.34
/** At or above this, the match is strong enough to accept in bulk without reading each one. */
export const STRONG_SCORE = 0.6

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are', 'you',
  'your', 'my', 'we', 'it', 'this', 'that', 'how', 'why', 'what', 'i',
])

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      // Strip emoji, punctuation and hashtags — captions are full of them and
      // none of it carries identity.
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  )
}

/** Token overlap, 0-1. */
function similarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0

  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  // Overlap against the *smaller* set, so a long caption doesn't dilute a title
  // it fully contains.
  return shared / Math.min(ta.size, tb.size)
}

/** Days between a post going out and the episode being scheduled. */
function daysApart(post: PostPerformance, episode: Episode): number | null {
  if (!episode.scheduledDate) return null
  const published = new Date(post.publishedAt).getTime()
  const scheduled = new Date(`${episode.scheduledDate}T12:00:00`).getTime()
  if (Number.isNaN(published) || Number.isNaN(scheduled)) return null
  return Math.abs(published - scheduled) / 86_400_000
}

export interface LinkSuggestion {
  post: PostPerformance
  episode: Episode
  /** 0-1. Above STRONG_SCORE it is safe to accept without reading. */
  score: number
  /** Why it matched, in plain words. */
  reason: string
}

function linkedIdFor(episode: Episode, platform: SocialPlatform): string | undefined {
  return platform === 'instagram' ? episode.instagramMediaId : episode.youtubeVideoId
}

/**
 * Proposes one episode per unlinked post, best first.
 *
 * Assignment is greedy over the strongest pairs, so two posts can never both
 * claim the same episode on the same platform — which would leave whichever was
 * applied second silently overwriting the first.
 */
export function suggestLinks(episodes: Episode[], posts: PostPerformance[]): LinkSuggestion[] {
  const live = episodes.filter((e) => !e.deletedAt)

  const pairs: LinkSuggestion[] = []
  for (const post of posts) {
    // Already linked to something? Nothing to propose.
    if (live.some((e) => linkedIdFor(e, post.platform) === post.id)) continue

    for (const episode of live) {
      // This episode already has a post on this platform.
      if (linkedIdFor(episode, post.platform)) continue

      const titleScore = similarity(post.title, episode.title)
      if (titleScore <= 0) continue

      const gap = daysApart(post, episode)
      // Timing corroborates a title match; it never carries one on its own,
      // because plenty of unrelated videos go out in the same week.
      const timingBoost = gap === null ? 0 : gap <= 3 ? 0.15 : gap <= 10 ? 0.07 : 0
      // Clamped: an exact title match is already conclusive, so timing has no
      // headroom to add there. It earns its keep on partial overlaps.
      const score = Math.min(1, titleScore + timingBoost)
      if (score < MIN_SCORE) continue

      const reason =
        timingBoost > 0
          ? `Title overlap, published ${Math.round(gap!)} day${Math.round(gap!) === 1 ? '' : 's'} from when it was scheduled`
          : 'Title overlap'

      pairs.push({ post, episode, score, reason })
    }
  }

  pairs.sort((a, b) => b.score - a.score)

  const takenPosts = new Set<string>()
  const takenEpisodes = new Set<string>()
  const out: LinkSuggestion[] = []
  for (const p of pairs) {
    const episodeKey = `${p.episode.id}:${p.post.platform}`
    if (takenPosts.has(p.post.id) || takenEpisodes.has(episodeKey)) continue
    takenPosts.add(p.post.id)
    takenEpisodes.add(episodeKey)
    out.push(p)
  }
  return out
}
