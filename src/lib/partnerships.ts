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
export const ISLAND_AREAS: { name: string; hint: string; stages: OpportunityStage[] }[] = [
  { name: 'Discovery Coast', hint: 'Find your next connection', stages: ['Discovery'] },
  { name: 'Research Village', hint: 'Get to know the brand', stages: ['Research'] },
  { name: 'Concept Studio', hint: 'Give the idea a shape', stages: ['Concept'] },
  { name: 'Outreach Port', hint: 'Put your work out there', stages: ['Ready to pitch', 'Pitched'] },
  { name: 'Conversation Bay', hint: 'Keep the conversation going', stages: ['Replied'] },
  { name: 'Negotiation Bridge', hint: 'Find the right agreement', stages: ['Negotiating'] },
  { name: 'Partnership City', hint: 'Make it official', stages: ['Agreed'] },
  { name: 'Production District', hint: 'Bring the concept to life', stages: ['In production'] },
  { name: 'Results Harbour', hint: 'Deliver, review, get paid', stages: ['Delivered', 'Paid'] },
  { name: 'Relationship Garden', hint: 'Grow something lasting', stages: ['Relationship'] },
]
export function localDate(offset = 0): string {
  const date = new Date(); date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function health(o: Opportunity): 'Healthy' | 'Needs attention' | 'Stalled' {
  if (o.stage === 'Paid' || (o.stage === 'Relationship' && !o.nextAction.trim())) return 'Healthy'
  if ((daysUntil(o.nextActionDate) ?? 0) < -7) return 'Stalled'
  return ['none', 'overdue', 'today'].includes(actionState(o)) ? 'Needs attention' : 'Healthy'
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
