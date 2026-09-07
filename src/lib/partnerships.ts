/**
 * Turning videos into a business.
 *
 * The three ways a brand deal can be shaped are genuinely different negotiations,
 * not variations on one, and creators lose money by conflating them. So the type
 * is chosen first and everything downstream follows from it:
 *
 *   PR    — the brand sends product. Nothing is owed in return unless it was
 *           agreed in advance. This is the one creators get wrong most often.
 *   Paid  — the brand is buying access to the audience, the idea, and the
 *           distribution. Follower count is part of the price.
 *   UGC   — the brand is buying the footage. It runs on the brand's channels or
 *           in its ads. Audience size is close to irrelevant, which is why a
 *           creator with a small following can still have a real UGC business.
 */

import type { SocialPlatform } from './social'

export type PartnershipType = 'pr' | 'paid' | 'ugc' | 'unsure'

export const PARTNERSHIP_TYPES: PartnershipType[] = ['pr', 'paid', 'ugc', 'unsure']

export interface PartnershipTypeInfo {
  id: PartnershipType
  label: string
  icon: string
  /** One line, on the card. */
  goal: string
  /** The paragraph under it. */
  detail: string
  /** Shown as a warning rather than a description — the thing that costs money. */
  caution?: string
  /** What the deal can consist of. Empty for PR, which has no deliverable by definition. */
  formats: string[]
  formatsLabel: string
}

export const TYPE_INFO: Record<PartnershipType, PartnershipTypeInfo> = {
  unsure: { id: 'unsure', label: 'Not sure', icon: 'help-circle', goal: 'Explore the right collaboration.', detail: 'Start with the brand fit and decide the partnership type together.', formats: [], formatsLabel: '' },
  pr: {
    id: 'pr',
    label: 'PR / Product seeding',
    icon: 'shopping-bag',
    goal: 'Build relationships and receive relevant products.',
    detail:
      'Best when you are early with a brand, or genuinely want to try the product. The ask is product seeding with no guaranteed coverage unless you agree it beforehand.',
    caution: 'Receiving PR does not mean you owe the brand content.',
    formats: [],
    formatsLabel: '',
  },
  paid: {
    id: 'paid',
    label: 'Paid partnership',
    icon: 'sparkles',
    goal: 'The brand pays for access to you, the content, and the distribution.',
    detail:
      'You are selling three things at once: your audience, your idea, and the fact that it goes out on your channels. Price all three.',
    formats: [
      'Sponsored Reel',
      'Sponsored Short',
      'Story set',
      'Integrated mention',
      'GRWM',
      'Review',
      'Styling challenge',
      'Campaign package',
    ],
    formatsLabel: 'What you would make',
  },
  ugc: {
    id: 'ugc',
    label: 'UGC',
    icon: 'film',
    goal: 'The brand pays for the content itself.',
    detail:
      'You produce the footage; the brand publishes it on its own channels or runs it as advertising. It never posts on yours, so your follower count barely matters — a small audience can still support a real UGC business.',
    formats: [
      'Product demo',
      'Testimonial',
      'GRWM',
      'Styling tutorial',
      'Problem / solution video',
      'Organic-style ad',
      'Voiceover video',
      'Product photography',
    ],
    formatsLabel: 'What you would make',
  },
}

/** Only a paid partnership sells these — UGC sells footage and PR sells nothing. */
export const VALUE_OFFERED = [
  'Audience access',
  'Creative concept',
  'Styling expertise',
  'Production quality',
  'Content distribution',
]

/* ----------------------------------------------------------------- stages --- */

export type OpportunityStage =
  | 'Discovery'
  | 'Concept'
  | 'Relationship'
  | 'Research'
  | 'Ready to pitch'
  | 'Pitched'
  | 'Replied'
  | 'Negotiating'
  | 'Agreed'
  | 'In production'
  | 'Delivered'
  | 'Paid'

export const STAGES: OpportunityStage[] = [
  'Discovery',
  'Research',
  'Concept',
  'Ready to pitch',
  'Pitched',
  'Replied',
  'Negotiating',
  'Agreed',
  'In production',
  'Delivered',
  'Paid',
  'Relationship',
]

/** What each column is actually waiting on, shown when it is empty. */
export const STAGE_HINT: Record<OpportunityStage, string> = {
  Discovery: 'Brands you want to approach.',
  Concept: 'Develop the idea and creative preview.',
  Relationship: 'Stay close to repeat partners.',
  Research: 'Brands worth approaching, before there is an idea.',
  'Ready to pitch': 'The idea exists. Nothing has been sent.',
  Pitched: 'Sent. Waiting.',
  Replied: 'They answered. Keep the thread warm.',
  Negotiating: 'Terms, fee, usage.',
  Agreed: 'Settled but not shot.',
  'In production': 'Being made.',
  Delivered: 'Sent to the brand. Not yet paid.',
  Paid: 'Done.',
}

/** Deals that are still live work; the rest are history. Drives the default view. */
export const OPEN_STAGES: OpportunityStage[] = STAGES.slice(0, STAGES.indexOf('Delivered') + 1)

export const STAGE_COLOR: Record<OpportunityStage, string> = {
  Discovery: '#8d9b92',
  Concept: '#b29b75',
  Relationship: '#60866f',
  Research: '#8d8577',
  'Ready to pitch': '#d3a75c',
  Pitched: '#c9a227',
  Replied: '#4f8fc0',
  Negotiating: '#8a7bd8',
  Agreed: '#6bb15a',
  'In production': '#b6598f',
  Delivered: '#4f8fc0',
  Paid: '#6bb15a',
}

/* ------------------------------------------------------------------ model --- */

export interface Brand {
  id: string
  name: string
  /** Jewellery, beauty, footwear — used later to suggest which brands to approach. */
  category: string
  website: string
  contactName: string
  contactEmail: string
  notes: string
  createdAt: string
  deletedAt?: string
}

export interface Opportunity {
  id: string
  brandId: string
  type: PartnershipType
  priority?: 'Low' | 'Normal' | 'High'
  journey?: JourneyStep[]
  activity?: Activity[]
  stage: OpportunityStage
  /** The creative idea's name — "One Lipstick, Three Outfits". */
  title: string
  /** What actually happens in it. */
  concept: string
  /** Why this brand and this creator make sense together. */
  fit: string
  /** Why the audience would care, as opposed to why the brand would. */
  audienceWhy: string
  /** Chosen from the type's format list. */
  formats: string[]
  /** Paid partnerships only. */
  valueOffered: string[]
  /** Free text, so it carries its own currency. */
  fee: string
  /** The thing that stops a deal going quiet. */
  nextAction: string
  /** ISO date, no time — a deal chases on a day, not at an hour. */
  nextActionDate: string
  /** Episodes standing as the deliverables. */
  episodeIds: string[]
  /** Which platforms it would go out on. Empty for UGC, which goes out on theirs. */
  platforms: SocialPlatform[]
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

/* ------------------------------------------------------------- next action --- */

export type ActionState = 'overdue' | 'today' | 'soon' | 'later' | 'none'

/** Days from today, negative when the date has passed. Null when unset. */
export function daysUntil(iso: string): number | null {
  if (!iso) return null
  const then = new Date(`${iso}T00:00:00`).getTime()
  if (Number.isNaN(then)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((then - today.getTime()) / 86_400_000)
}

export function actionState(o: Opportunity): ActionState {
  if (!o.nextAction.trim() || !o.nextActionDate) return 'none'
  const days = daysUntil(o.nextActionDate)
  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  return days <= 7 ? 'soon' : 'later'
}

/**
 * Deals do not usually die of rejection; they die of silence. An open deal with
 * nothing scheduled to happen next is the one to worry about, so it is surfaced
 * ahead of everything else rather than left to be noticed.
 */
export function needsAttention(opportunities: Opportunity[]): Opportunity[] {
  return opportunities
    .filter((o) => !o.deletedAt && OPEN_STAGES.includes(o.stage))
    .filter((o) => {
      const state = actionState(o)
      return state === 'none' || state === 'overdue' || state === 'today'
    })
    .sort((a, b) => {
      // Overdue first, oldest first; then today; then the ones with no plan at all.
      const rank = (o: Opportunity) => {
        const s = actionState(o)
        return s === 'overdue' ? 0 : s === 'today' ? 1 : 2
      }
      const byRank = rank(a) - rank(b)
      if (byRank !== 0) return byRank
      return (daysUntil(a.nextActionDate) ?? 9999) - (daysUntil(b.nextActionDate) ?? 9999)
    })
}

export function formatActionDate(iso: string): string {
  const days = daysUntil(iso)
  if (days === null) return ''
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return '1 day overdue'
  if (days < 0) return `${-days} days overdue`
  if (days <= 14) return `In ${days} days`
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}


export interface JourneyStep { id: string; label: string; stage: OpportunityStage; completedAt?: string }
export interface Activity { id: string; at: string; channel: 'Email' | 'Instagram' | 'LinkedIn' | 'Notes'; text: string }

/* --------------------------------------------------------------- destinations */

/**
 * The partnership world is a single winding route from first signal to a
 * lasting relationship. Each stage has a place, and every open deal lives at
 * one of them — the diorama and the table both read off this list.
 *
 * Coordinates are in three.js world units (x/z), matching the sculpted island.
 */
export interface Destination {
  key: string
  name: string
  hint: string
  x: number
  z: number
}

export const DESTINATIONS: Destination[] = [
  { key: 'radar', name: 'Brand Radar', hint: 'Signals worth watching', x: -38, z: 13 },
  { key: 'research', name: 'Research House', hint: 'Get to know the brand', x: -30, z: -6 },
  { key: 'idea', name: 'Idea Lab', hint: 'Shape the concept', x: -19, z: 12 },
  { key: 'pitch', name: 'Pitch Workshop', hint: 'Assemble the pitch', x: -9, z: -8 },
  { key: 'outreach', name: 'Outreach Terminal', hint: 'Sent, waiting', x: 1, z: 10 },
  { key: 'control', name: 'Follow-up Control Room', hint: 'Chasing quiet threads', x: 10, z: -8 },
  { key: 'response', name: 'Response Station', hint: 'They answered', x: 18, z: 10 },
  { key: 'bridge', name: 'Negotiation Bridge', hint: 'Terms, fee, usage', x: 26, z: 0 },
  { key: 'gate', name: 'Deal Gate', hint: 'Agreed, not shot', x: 33, z: -12 },
  { key: 'studio', name: 'Production Studio', hint: 'Being made', x: 42, z: 4 },
  { key: 'harbour', name: 'Delivery & Payment Harbour', hint: 'Delivered · waiting on payment', x: 49, z: -8 },
  { key: 'garden', name: 'Relationship Garden', hint: 'Lasting partners', x: 55, z: 10 },
  { key: 'archive', name: 'Archive', hint: 'Closed, kept on file', x: 33, z: -24 },
]

/** One-to-one mapping from lifecycle stage to a world destination. */
const STAGE_TO_DEST: Record<OpportunityStage, number> = {
  Discovery: 0,
  Research: 1,
  Concept: 2,
  'Ready to pitch': 3,
  Pitched: 4,
  Replied: 6,
  Negotiating: 7,
  Agreed: 8,
  'In production': 9,
  Delivered: 10,
  Paid: 10,
  Relationship: 11,
}

/**
 * A pitched deal that has been sitting there for more than four business days
 * belongs at the Follow-up Control Room, not still at the Outreach Terminal —
 * the destination itself is a nudge.
 */
export function destinationIndex(o: Opportunity): number {
  if (o.deletedAt) return 12
  if (o.stage === 'Pitched') {
    const daysSince = lastContactDaysAgo(o)
    if (daysSince != null && daysSince >= 4) return 5
  }
  return STAGE_TO_DEST[o.stage]
}

export function destinationFor(o: Opportunity): Destination {
  return DESTINATIONS[destinationIndex(o)]
}

/** Kept so any older code that still imports `ISLAND_AREAS` compiles. */
export const ISLAND_AREAS: { name: string; hint: string; stages: OpportunityStage[] }[] = DESTINATIONS.slice(0, 12).map(
  (d, i) => ({
    name: d.name,
    hint: d.hint,
    stages: (Object.keys(STAGE_TO_DEST) as OpportunityStage[]).filter((s) => STAGE_TO_DEST[s] === i),
  }),
)
export function localDate(offset = 0): string {
  const date = new Date(); date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function health(o: Opportunity): 'Healthy' | 'Needs attention' | 'Stalled' {
  if (o.stage === 'Paid' || (o.stage === 'Relationship' && !o.nextAction.trim())) return 'Healthy'
  if ((daysUntil(o.nextActionDate) ?? 0) < -7) return 'Stalled'
  return ['none', 'overdue', 'today'].includes(actionState(o)) ? 'Needs attention' : 'Healthy'
}

/**
 * The design speaks in Moving well / Needs attention / Stalled / Waiting — the
 * fourth state is what an unset deal on a signal-only stage looks like, which
 * is genuinely different from a Healthy deal that has a real plan.
 */
export type WorldHealth = 'Moving well' | 'Needs attention' | 'Stalled' | 'Waiting'

export function worldHealth(o: Opportunity): WorldHealth {
  if (!o.nextAction.trim() && (o.stage === 'Discovery' || o.stage === 'Research' || o.stage === 'Relationship')) return 'Waiting'
  const h = health(o)
  if (h === 'Healthy') return 'Moving well'
  return h
}

export const WORLD_HEALTH_COLOR: Record<WorldHealth, string> = {
  'Moving well': '#5f7d69',
  'Needs attention': '#c8a86b',
  Stalled: '#a05f57',
  Waiting: '#8d908b',
}

export function lastContactDaysAgo(o: Opportunity): number | null {
  const last = lastContact(o)
  if (!last) return null
  const then = new Date(last).getTime()
  if (Number.isNaN(then)) return null
  return Math.round((Date.now() - then) / 86_400_000)
}

/** Where the money actually lands: `confirmed` for won deals, otherwise `fee`. */
export function confirmedValue(o: Opportunity): string {
  if (['Agreed', 'In production', 'Delivered', 'Paid', 'Relationship'].includes(o.stage)) {
    return o.fee || '—'
  }
  return '—'
}

/** Won / Declined / Open — what closed the deal, in one word. */
export function outcomeOf(o: Opportunity): 'Won' | 'Declined' | 'Open' {
  if (['Agreed', 'In production', 'Delivered', 'Paid', 'Relationship'].includes(o.stage)) return 'Won'
  return 'Open'
}

export const CHANNELS = ['Email', 'Instagram', 'LinkedIn'] as const
export type Channel = (typeof CHANNELS)[number]

export interface ChannelState {
  channel: Channel
  state: 'Not started' | 'Sent' | 'Replied' | 'Bounced' | 'Connected'
  last?: string
  count: number
}

/** What each outreach route looks like right now, deduced from logged activity. */
export function channelStates(o: Opportunity): ChannelState[] {
  const acts = (o.activity ?? []).filter((a) => a.channel !== 'Notes') as Activity[]
  return CHANNELS.map((channel) => {
    const rows = acts.filter((a) => a.channel === channel).sort((a, b) => b.at.localeCompare(a.at))
    const last = rows[0]?.at
    let state: ChannelState['state'] = 'Not started'
    if (rows.some((r) => /bounced|undeliverable/i.test(r.text))) state = 'Bounced'
    else if (rows.some((r) => /repl(ied|y)|answered|responded/i.test(r.text))) state = 'Replied'
    else if (channel === 'LinkedIn' && rows.some((r) => /connect/i.test(r.text))) state = 'Connected'
    else if (rows.length) state = 'Sent'
    return { channel, state, last, count: rows.length }
  })
}
export function activityEntry(text: string, channel: Activity['channel'] = 'Notes'): Activity {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), channel, text }
}
export function makeJourney(contacted: boolean, hasConcept: boolean): JourneyStep[] {
  const steps: [string, OpportunityStage][] = contacted
    ? [['Track response', 'Pitched'], ['Follow up by email', 'Pitched'], ['Review response', 'Replied']]
    : hasConcept
      ? [['Find contacts', 'Research'], ['Create spec preview', 'Concept'], ['Prepare pitch', 'Ready to pitch'], ['Send email', 'Ready to pitch'], ['Follow up by email', 'Pitched'], ['Track response', 'Pitched']]
      : [['Research brand', 'Research'], ['Find product fit', 'Research'], ['Find contacts', 'Research'], ['Generate concepts', 'Concept'], ['Choose concept', 'Concept'], ['Create spec preview', 'Concept'], ['Prepare pitch', 'Ready to pitch'], ['Send email', 'Ready to pitch'], ['Follow up by email', 'Pitched'], ['Track response', 'Pitched']]
  const all: [string, OpportunityStage][] = [...steps, ['Review collaboration', 'Replied'], ['Agree rates and usage rights', 'Negotiating'], ['Confirm agreement', 'Agreed'], ['Create content', 'In production'], ['Deliver and review results', 'Delivered'], ['Confirm payment / close campaign', 'Delivered'], ['Plan next collaboration', 'Relationship'] as [string, OpportunityStage]]
  return all.map(([label, stage]) => ({ id: crypto.randomUUID(), label, stage }))
}
/** Existing records get a forward plan without inventing completed history. */
export function journeyFor(o: Opportunity): JourneyStep[] {
  if (o.journey?.length) return o.journey
  const plan = makeJourney(false, Boolean(o.concept.trim()))
  const future = plan.filter(step => STAGES.indexOf(step.stage) >= STAGES.indexOf(o.stage))
  return o.nextAction.trim() ? [{ id: `current-${o.id}`, label: o.nextAction, stage: o.stage }, ...future.filter(s => s.label !== o.nextAction)] : future
}
export function completeAction(o: Opportunity): Partial<Opportunity> {
  const plan = journeyFor(o)
  const current = plan.find(step => !step.completedAt)
  const done = o.nextAction.trim() || current?.label
  if (!done) return {}
  const journey = plan.map(step => step.id === current?.id ? { ...step, label: done, completedAt: new Date().toISOString() } : step)
  const next = journey.find(step => !step.completedAt)
  return { journey, nextAction: next?.label ?? '', nextActionDate: next ? localDate(1) : '', stage: next?.stage ?? o.stage,
    activity: [...(o.activity ?? []), activityEntry(`Completed: ${done}`)] }
}
export function lastContact(o: Opportunity): string {
  return [...(o.activity ?? [])].filter(a => a.channel !== 'Notes').sort((a,b) => b.at.localeCompare(a.at))[0]?.at ?? ''
}

export function stageChange(o: Opportunity, stage: OpportunityStage): Partial<Opportunity> {
  if (stage === o.stage) return {}
  const completed = (o.journey ?? []).filter(s => s.completedAt)
  const future = makeJourney(false, false).filter(s => STAGES.indexOf(s.stage) >= STAGES.indexOf(stage))
  const firstAction: Partial<Record<OpportunityStage, string>> = { Discovery: 'Choose a brand to research', Concept: 'Generate concepts', Pitched: 'Track response', Paid: 'Plan next collaboration' }
  const label = firstAction[stage] ?? future.find(s => s.stage === stage)?.label ?? 'Plan next collaboration'
  const first = { id: crypto.randomUUID(), label, stage }
  return { stage, journey: [...completed, first, ...future.filter(s => s.label !== label)], nextAction: label, nextActionDate: localDate(1), activity: [...(o.activity ?? []),activityEntry(`Stage changed: ${o.stage} → ${stage}`)] }
}
