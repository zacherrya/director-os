/**
 * Ranks beat structures by how the episodes built on them actually performed.
 *
 * Two design decisions worth stating:
 *
 * 1. Matching is by **beat signature**, not just by the pattern an episode was
 *    created from. Most episodes are built by hand, and a scoreboard that only
 *    counted formally-applied patterns would sit empty forever. Matching on the
 *    ordered list of scene purposes also surfaces structures the creator uses
 *    habitually without ever having templated them.
 *
 * 2. Confidence is never overstated. At these volumes nothing here is
 *    statistically solid, so a structure with fewer than MIN_SAMPLE linked posts
 *    reports no numbers at all, and the ceiling is "fair" rather than anything
 *    that sounds conclusive. A ranked table implies rigour; the labels are what
 *    stop it from implying more than it has.
 */

import type { Episode, Pattern, ScenePurpose } from './types'
import { engagementRate } from './social'
import type { LinkedPost } from './draftCheck'
import { diagnoseExit } from './retention'

/** Below this, a "median" is just one post wearing a lab coat. */
export const MIN_SAMPLE = 2
/** At or above this, we'll call it fair — still not proof. */
const FAIR_SAMPLE = 4

export type Confidence = 'none' | 'low' | 'fair'

export interface PatternScore {
  key: string
  /** Present when this structure matches a saved pattern. */
  patternId?: string
  name: string
  beats: ScenePurpose[]
  matches: LinkedPost[]
  sampleSize: number
  medianViews: number | null
  medianEngagement: number | null
  /** Median share of the planned runtime the average viewer watched, 0-1. */
  medianWatched: number | null
  confidence: Confidence
  /** True when this structure isn't in the pattern library yet. */
  discovered: boolean
}

export function beatSignature(beats: ScenePurpose[]): string {
  return beats.join(' → ')
}

export function episodeSignature(episode: Episode): string {
  return beatSignature(episode.scenes.map((s) => s.purpose))
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function confidenceFor(n: number): Confidence {
  if (n < MIN_SAMPLE) return 'none'
  return n >= FAIR_SAMPLE ? 'fair' : 'low'
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  none: 'Not enough data',
  low: 'Low confidence',
  fair: 'Fair confidence',
}

function scoreGroup(key: string, name: string, beats: ScenePurpose[], matches: LinkedPost[], patternId?: string): PatternScore {
  const watched = matches
    .map((m) => diagnoseExit(m.post.avgWatchTime, m.episode)?.fractionWatched ?? null)
    .filter((v): v is number => v !== null)

  return {
    key,
    patternId,
    name,
    beats,
    matches,
    sampleSize: matches.length,
    medianViews: median(matches.map((m) => m.post.views).filter((v): v is number => v !== null)),
    medianEngagement: median(matches.map((m) => engagementRate(m.post)).filter((v): v is number => v !== null)),
    medianWatched: median(watched),
    confidence: confidenceFor(matches.length),
    discovered: patternId === undefined,
  }
}

/**
 * Scores every saved pattern, plus any beat structure appearing across linked
 * episodes that isn't in the library yet.
 */
export function scorePatterns(patterns: Pattern[], history: LinkedPost[]): PatternScore[] {
  const bySignature = new Map<string, LinkedPost[]>()
  for (const item of history) {
    const sig = episodeSignature(item.episode)
    bySignature.set(sig, [...(bySignature.get(sig) ?? []), item])
  }

  const claimed = new Set<string>()
  const scores: PatternScore[] = []

  for (const pattern of patterns) {
    const beats = pattern.beats.map((b) => b.purpose)
    const sig = beatSignature(beats)

    // An episode counts for a pattern if it was built from it, or if its beat
    // structure matches — the latter is what makes this work retroactively.
    const matches = history.filter(
      (h) => h.episode.patternId === pattern.id || episodeSignature(h.episode) === sig,
    )
    if (matches.length > 0) claimed.add(sig)
    scores.push(scoreGroup(`pattern-${pattern.id}`, pattern.name, beats, matches, pattern.id))
  }

  for (const [sig, matches] of bySignature) {
    if (claimed.has(sig)) continue
    if (matches.length < MIN_SAMPLE) continue // one-offs aren't a structure
    const beats = matches[0].episode.scenes.map((s) => s.purpose)
    scores.push(scoreGroup(`found-${sig}`, sig, beats, matches))
  }

  // Rank on engagement first — it's the most comparable figure across posts with
  // wildly different reach. Structures with no data sink rather than sort as zero.
  return scores.sort((a, b) => {
    if (a.confidence === 'none' && b.confidence !== 'none') return 1
    if (b.confidence === 'none' && a.confidence !== 'none') return -1
    const ae = a.medianEngagement ?? -1
    const be = b.medianEngagement ?? -1
    if (be !== ae) return be - ae
    return (b.medianViews ?? -1) - (a.medianViews ?? -1)
  })
}

/** Overall median engagement across all linked posts, as the comparison line. */
export function overallMedianEngagement(history: LinkedPost[]): number | null {
  return median(history.map((h) => engagementRate(h.post)).filter((v): v is number => v !== null))
}
