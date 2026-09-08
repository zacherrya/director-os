/**
 * The pitch.
 *
 * The point of this file is that it refuses to write the email first. Brands
 * receive "Hi, I love your brand, would you like to collaborate?" constantly,
 * and the reason that message fails is not its prose — it is that there is no
 * thinking behind it. So the strategy is assembled and checked before any text
 * is produced, against a fixed five-part shape:
 *
 *   PERSONAL   — show you have actually looked at them
 *   RELEVANCE  — why the two of you make sense together
 *   IDEA       — something they can picture
 *   PROOF      — relevant work, with real numbers
 *   ASK        — make the collaboration you want obvious
 *
 * The three deal types then diverge sharply, and the differences are the
 * substance rather than tone:
 *
 *   PR   never promises content. Receiving product does not create an
 *        obligation, and a pitch that quietly implies otherwise sets the
 *        expectation anyway.
 *   Paid leads with the idea, because that is what lifts the conversation off
 *        follower count, and carries the numbers.
 *   UGC  carries NO audience numbers at all. The brand is buying footage for
 *        its own channels; reach is not what is being sold, and volunteering it
 *        invites the wrong comparison.
 */

import { computeBaselines } from './retention.ts'
import { PLATFORM_LABEL, type PostPerformance, type SocialPlatform } from './social.ts'
import type { MediaKitProfile } from './types.ts'
import type { Brand, Opportunity } from './partnerships.ts'
import { TYPE_INFO } from './partnerships.ts'

export type FormulaStep = 'Personal' | 'Relevance' | 'Idea' | 'Proof' | 'Ask'

export interface FormulaRow {
  step: FormulaStep
  /** What this part of the pitch is for — shown as the teaching line. */
  purpose: string
  met: boolean
  /** The content when met; what is missing when not. */
  detail: string
  /** Steps that do not apply to this deal type are shown, greyed, with a reason. */
  notApplicable?: boolean
}

/* ------------------------------------------------------------------ proof --- */

export interface PitchProof {
  platform: SocialPlatform
  medianViews: number | null
  medianEngagement: number | null
  sampleSize: number
}

/**
 * Read from posts already fetched into the store, so building a pitch never
 * waits on the network. Nothing is invented: with no published history there is
 * no proof, and the pitch says nothing rather than something vague.
 */
export function pitchProof(posts: PostPerformance[]): PitchProof | null {
  if (posts.length === 0) return null
  const byPlatform = new Map<SocialPlatform, PostPerformance[]>()
  for (const p of posts) {
    const list = byPlatform.get(p.platform) ?? []
    list.push(p)
    byPlatform.set(p.platform, list)
  }
  let best: PitchProof | null = null
  for (const [platform, list] of byPlatform) {
    const b = computeBaselines(list, null)
    if (!b.reliable || b.medianViews === null) continue
    if (!best || b.medianViews > (best.medianViews ?? 0)) {
      best = {
        platform,
        medianViews: b.medianViews,
        medianEngagement: b.medianEngagement,
        sampleSize: b.sampleSize,
      }
    }
  }
  return best
}

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(Math.round(n))
}

function proofSentence(proof: PitchProof): string {
  const views = compactCount(proof.medianViews ?? 0)
  const label = PLATFORM_LABEL[proof.platform]
  const rate =
    proof.medianEngagement !== null ? ` at ${proof.medianEngagement.toFixed(1)}% engagement` : ''
  // The sample size travels with the number. A brand's marketing team can check,
  // and a median over three posts stated as though it were a track record is the
  // fastest way to lose the room.
  return `Across my last ${proof.sampleSize} ${label} posts, a typical one does around ${views} views${rate}.`
}

/* ---------------------------------------------------------------- formula --- */

/** What the pitch is asking for, in one phrase, built from the deal itself. */
export function askPhrase(o: Opportunity): string {
  const formats = o.formats.length > 0 ? o.formats.join(', ') : ''
  if (o.type === 'pr') return 'a PR collaboration'
  if (o.type === 'ugc') return formats ? `UGC — ${formats}` : 'UGC you can run on your own channels'
  return formats ? `a paid partnership — ${formats}` : 'a paid partnership'
}

export function formulaRows(o: Opportunity, proof: PitchProof | null): FormulaRow[] {
  const rows: FormulaRow[] = [
    {
      step: 'Personal',
      purpose: 'Show you have actually looked at them.',
      met: (o.brandObservation ?? '').trim().length > 0,
      detail:
        (o.brandObservation ?? '').trim() || 'What did you notice about this brand? One specific thing.',
    },
    {
      step: 'Relevance',
      purpose: 'Why the two of you make sense together.',
      met: o.fit.trim().length > 0,
      detail: o.fit.trim() || 'Fill in “Why this brand fits”.',
    },
    {
      step: 'Idea',
      purpose: 'Give them something they can picture.',
      met: o.title.trim().length > 0 && o.concept.trim().length > 0,
      detail:
        o.title.trim() && o.concept.trim()
          ? `“${o.title.trim()}” — ${o.concept.trim()}`
          : 'Name the idea and say what happens in it.',
    },
  ]

  if (o.type === 'ugc') {
    rows.push({
      step: 'Proof',
      purpose: 'Deliberately left out.',
      met: true,
      notApplicable: true,
      detail:
        'A UGC pitch carries no audience numbers. They are buying the footage for their own channels, so your reach is not what is being sold — quoting it invites the wrong comparison.',
    })
  } else {
    rows.push({
      step: 'Proof',
      purpose: 'Relevant work, with real numbers.',
      met: proof !== null,
      detail: proof
        ? proofSentence(proof)
        : 'No published performance yet. Connect an account in Analytics, or send work samples instead of numbers.',
    })
  }

  rows.push({
    step: 'Ask',
    purpose: 'Make the collaboration you want obvious.',
    met: o.type === 'pr' || o.formats.length > 0,
    detail:
      o.type === 'pr'
        ? 'Product seeding, with no coverage promised.'
        : o.formats.length > 0
          ? askPhrase(o)
          : `Pick what you would make under “${TYPE_INFO[o.type].formatsLabel}”.`,
  })

  return rows
}

/** Personal, Relevance and Idea carry the pitch. Proof and Ask sharpen it. */
export function pitchReady(rows: FormulaRow[]): boolean {
  return rows.filter((r) => ['Personal', 'Relevance', 'Idea'].includes(r.step)).every((r) => r.met)
}

/* ----------------------------------------------------------------- render --- */

function greeting(brand: Brand | undefined): string {
  const first = brand?.contactName.trim().split(/\s+/)[0]
  return `Hi ${first || brand?.name || 'there'},`
}

/** Ensures a fragment ends as a sentence, so joining two of them cannot produce
 * "…for a workday. — and I think…". */
function sentence(text: string): string {
  const t = text.trim()
  if (!t) return ''
  return /[.!?…]$/.test(t) ? t : `${t}.`
}

/**
 * "Styled by Shivangi" is a brand name, not a person — taking its first word
 * yields "I'm Styled". Pull the person out of the common "<something> by <name>"
 * handle, and where there is no person to find, do not invent one.
 */
function creatorFirstName(displayName: string): string | null {
  const byMatch = /\bby\s+(.+)$/i.exec(displayName.trim())
  if (byMatch) return byMatch[1].trim().split(/\s+/)[0]
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  return words.length === 1 ? words[0] : null
}

function whoIAm(kit: MediaKitProfile, long: boolean): string {
  const name = kit.displayName.trim()
  const first = creatorFirstName(name)
  const role = long
    ? 'a personal stylist and fashion creator producing short-form content around styling, beauty and product education'
    : `the personal stylist and creator behind ${name || 'my channel'}`
  return first ? `I'm ${first}, ${role}.` : `I'm ${role}.`
}

export function buildPitch(
  o: Opportunity,
  brand: Brand | undefined,
  kit: MediaKitProfile,
  proof: PitchProof | null,
): string {
  const them = brand?.name ?? 'your team'
  const idea = o.title.trim()
  const concept = o.concept.trim()
  const observation = (o.brandObservation ?? '').trim()
  const fit = o.fit.trim()
  const why = o.audienceWhy.trim()
  const p: string[] = [greeting(brand)]

  if (o.type === 'pr') {
    p.push(whoIAm(kit, false))
    p.push(
      `${sentence(observation)} I think ${them} would fit naturally into the practical styling content I make.${
        fit ? ` ${sentence(fit)}` : ''
      }`,
    )
    // No deliverable is named and nothing is promised. "Where they genuinely
    // fit" is the whole point of the paragraph.
    p.push(
      `I'd love to explore a PR collaboration, and to potentially feature pieces in upcoming styling content where they genuinely fit.`,
    )
    p.push(`I've attached my media kit and a few examples of my work.`)
    p.push(`Would love to explore something together.`)
  } else if (o.type === 'ugc') {
    p.push(whoIAm(kit, true))
    p.push(
      `${sentence(observation)} I'd love to create UGC for ${them} that you could use across your own social channels or campaigns.`,
    )
    p.push(`One concept I'd suggest is:`)
    p.push(`“${idea}” — ${sentence(concept)}`)
    p.push(
      why
        ? `${sentence(why)} The goal is for the product to feel naturally integrated into useful creator-style content rather than a traditional advertisement.`
        : `The goal is for the product to feel naturally integrated into useful creator-style content rather than a traditional advertisement.`,
    )
    p.push(`Happy to share examples and to discuss deliverables or usage requirements.`)
  } else {
    p.push(whoIAm(kit, false))
    p.push(`${sentence(observation)}${fit ? ` ${sentence(fit)}` : ''}`)
    p.push(`I had a content idea for ${them} that I think would fit both our audiences:`)
    p.push(`“${idea}” — ${sentence(concept)}`)
    if (why) p.push(sentence(`Rather than a traditional product promotion, ${why[0].toLowerCase()}${why.slice(1)}`))
    p.push(`I'd love to explore this as ${askPhrase(o)}.`)
    if (proof) p.push(proofSentence(proof))
    p.push(`I've attached my media kit and relevant work below.`)
  }

  return p.filter((line) => line.trim().length > 0).join('\n\n')
}
