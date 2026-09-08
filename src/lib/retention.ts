/**
 * Turns raw platform numbers into the two readings that actually change what you
 * shoot next: where the average viewer walks out, and whether a post beat your
 * own normal.
 *
 * Both deliberately refuse to answer on thin data. A "median" over two posts and
 * a drop-off point derived from a missing timeline are worse than no number at
 * all — they read as authoritative and send you rewriting the wrong scene.
 */

import type { Episode } from './types'
import { engagementRate, type PostPerformance } from './social.ts'

/** Below this many posts, a median is just one of the numbers. */
const MIN_SAMPLE = 3

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export interface Baselines {
  medianViews: number | null
  medianEngagement: number | null
  /** Median reach as a multiple of follower count — how far posts travel beyond
   * the existing audience. Instagram only; YouTube's Data API reports no reach. */
  medianReachMultiple: number | null
  sampleSize: number
  /** False when there aren't enough posts for the medians to mean anything. */
  reliable: boolean
}

export function computeBaselines(posts: PostPerformance[], followers: number | null): Baselines {
  const views = posts.map((p) => p.views).filter((v): v is number => v !== null)
  const rates = posts.map(engagementRate).filter((v): v is number => v !== null)
  const reaches = posts.map((p) => p.reach).filter((v): v is number => v !== null)

  const medianReach = median(reaches)
  const canCompareToAudience = followers !== null && followers > 0 && medianReach !== null

  return {
    medianViews: median(views),
    medianEngagement: median(rates),
    medianReachMultiple: canCompareToAudience ? medianReach / followers : null,
    sampleSize: posts.length,
    reliable: posts.length >= MIN_SAMPLE,
  }
}

/** How this post's views compare to the account's own median. 1 = exactly normal. */
export function viewsMultiple(post: PostPerformance, baselines: Baselines): number | null {
  if (!baselines.reliable || !baselines.medianViews || post.views === null) return null
  return post.views / baselines.medianViews
}

export interface ExitPoint {
  sceneId: string
  sceneIndex: number
  purpose: string
  /** Seconds into that scene at which the average viewer leaves. */
  secondsIntoScene: number
  /** Share of the planned runtime the average viewer saw, 0-1. */
  fractionWatched: number
  /** The average viewer made it past the end of the plan. */
  watchedToEnd: boolean
}

/**
 * Locates the average viewer's exit inside the episode's planned timeline.
 *
 * Two honest limits, both worth repeating wherever this is displayed:
 * average watch time is a single number, not a curve — so this is the *average*
 * exit, not the steepest drop. And it is measured against the plan in Director OS,
 * which can drift from the runtime of the file actually published.
 */
export function diagnoseExit(avgWatchTime: number | null, episode: Episode | undefined): ExitPoint | null {
  if (avgWatchTime === null || avgWatchTime <= 0) return null
  if (!episode || episode.scenes.length === 0) return null

  const planned = episode.length
  if (!planned || planned <= 0) return null

  const last = episode.scenes[episode.scenes.length - 1]
  if (avgWatchTime >= planned) {
    return {
      sceneId: last.id,
      sceneIndex: last.index,
      purpose: last.purpose,
      secondsIntoScene: Math.max(0, planned - last.start),
      fractionWatched: 1,
      watchedToEnd: true,
    }
  }

  const scene = episode.scenes.find((s) => avgWatchTime >= s.start && avgWatchTime < s.end) ?? episode.scenes[0]
  return {
    sceneId: scene.id,
    sceneIndex: scene.index,
    purpose: scene.purpose,
    secondsIntoScene: Math.max(0, avgWatchTime - scene.start),
    fractionWatched: avgWatchTime / planned,
    watchedToEnd: false,
  }
}
