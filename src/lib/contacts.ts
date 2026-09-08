/**
 * Contact Nucleus — who to send the pitch to, and why them.
 *
 * The hard rule here is provenance. Director has no connector that can read a
 * brand's staff list, so every person in this file was put there by the user or
 * imported from something they can see. Nothing is inferred, and in particular
 * an email address, a job title or whether someone still works somewhere is
 * never guessed: each field carries a source, and confidence is recorded rather
 * than assumed. A contact list that quietly invents a plausible-looking address
 * is worse than an empty one, because the pitch goes nowhere and the creator
 * does not find out for a fortnight.
 *
 * The recommendation is a ranking, not an oracle. It always says why, and the
 * user can always pick someone else.
 */

import { CHANNELS, type Channel, type PartnershipType } from './partnerships.ts'

/* ------------------------------------------------------------- vocabulary --- */

export const DEPARTMENTS = [
  'PR',
  'Influencer Marketing',
  'Creator Partnerships',
  'Content',
  'Social Media',
  'UGC',
  'Paid Partnerships',
  'Brand Marketing',
  'Events',
  'Agency',
  'Management',
  'Finance',
] as const
export type Department = (typeof DEPARTMENTS)[number]

export const SENIORITIES = [
  'Unknown',
  'Coordinator',
  'Executive',
  'Manager',
  'Senior Manager',
  'Head',
  'Director',
  'VP or above',
] as const
export type Seniority = (typeof SENIORITIES)[number]

/** Where a detail came from. Shown on the card — never blank, never guessed. */
export const CONTACT_SOURCES = [
  'Added manually',
  'Gmail',
  'LinkedIn',
  'Instagram',
  'Previous campaign',
  'Imported contact',
  'Team referral',
  'Public business information',
] as const
export type ContactSource = (typeof CONTACT_SOURCES)[number]

/** How sure we are this person and their details are real and current. */
export const CONFIDENCES = ['Confirmed', 'Likely', 'Unverified'] as const
export type ContactConfidence = (typeof CONFIDENCES)[number]

/** The state of the actual relationship, not a guess at how senior they are. */
export const STRENGTHS = ['Not contacted', 'Contacted', 'In conversation', 'Worked together'] as const
export type RelationshipStrength = (typeof STRENGTHS)[number]

export const REPLY_STATES = ['None', 'Replied', 'Positive', 'Not now', 'Declined', 'Bounced'] as const
export type ReplyState = (typeof REPLY_STATES)[number]

export const CONTACT_STATES = ['Active', 'Left company', 'Incorrect'] as const
export type ContactState = (typeof CONTACT_STATES)[number]

/* ------------------------------------------------------------------ model --- */

export interface Contact {
  id: string
  brandId: string
  name: string
  /** Their job title, exactly as the user found it. Never inferred. */
  role: string
  department: Department | ''
  seniority: Seniority
  email: string
  phone: string
  linkedin: string
  instagram: string
  /** Free text — "London", "IST", whatever the user knows. */
  location: string
  preferredChannel: Channel | ''
  source: ContactSource
  /** Contact id of whoever introduced them, for warm-intro paths. */
  introducedById?: string
  notes: string
  strength: RelationshipStrength
  confidence: ContactConfidence
  state: ContactState
  replyState: ReplyState
  /** ISO date. */
  lastContactedAt?: string
  createdAt: string
  deletedAt?: string
}

export function emptyContact(brandId: string, id: string): Contact {
  return {
    id,
    brandId,
    name: '',
    role: '',
    department: '',
    seniority: 'Unknown',
    email: '',
    phone: '',
    linkedin: '',
    instagram: '',
    location: '',
    preferredChannel: '',
    source: 'Added manually',
    notes: '',
    strength: 'Not contacted',
    confidence: 'Unverified',
    state: 'Active',
    replyState: 'None',
    createdAt: new Date().toISOString(),
  }
}

/* ---------------------------------------------------------------- routing --- */

/**
 * Which departments matter for which kind of deal. A PR gifting contact is the
 * wrong person to send a rate card to, and the creator-partnerships manager is
 * the wrong person to ask for a product sample — sending to the wrong desk is
 * one of the commonest reasons a good pitch gets no reply.
 */
export const TYPE_DEPARTMENTS: Record<PartnershipType, Department[]> = {
  pr: ['PR', 'Influencer Marketing', 'Brand Marketing', 'Agency'],
  paid: ['Creator Partnerships', 'Influencer Marketing', 'Brand Marketing', 'Paid Partnerships', 'Agency'],
  ugc: ['Content', 'UGC', 'Social Media', 'Paid Partnerships', 'Brand Marketing'],
  // Undecided deals cast the widest net rather than pretending to know the desk.
  unsure: ['Creator Partnerships', 'Influencer Marketing', 'PR', 'Brand Marketing', 'Agency'],
}

export function isRelevant(contact: Contact, type: PartnershipType): boolean {
  if (!contact.department) return false
  return TYPE_DEPARTMENTS[type].includes(contact.department)
}

/* --------------------------------------------------------- recommendation --- */

export interface Recommendation {
  contact: Contact
  score: number
  /** Plain-language reasons, strongest first. Shown verbatim. */
  reasons: string[]
  /** Why they might be the wrong choice. Shown alongside, never hidden. */
  cautions: string[]
}

const SENIORITY_WEIGHT: Record<Seniority, number> = {
  Unknown: 0,
  Coordinator: 1,
  Executive: 1,
  Manager: 3,
  'Senior Manager': 3,
  Head: 2,
  Director: 2,
  'VP or above': 1,
}

/**
 * Ranks who to approach for one opportunity.
 *
 * Deliberately favours a manager over a VP: the person who runs creator
 * partnerships day to day answers their own inbox, and the VP does not. Prior
 * contact outranks everything, because a warm thread beats a cold one from a
 * better-titled stranger.
 */
export function recommendContacts(
  contacts: Contact[],
  type: PartnershipType,
): Recommendation[] {
  const live = contacts.filter((c) => !c.deletedAt && c.state === 'Active')

  return live
    .map((c) => {
      const reasons: string[] = []
      const cautions: string[] = []
      let score = 0

      if (c.replyState === 'Positive') {
        score += 10
        reasons.push('They replied positively before — this is a warm thread, not a cold approach.')
      } else if (c.replyState === 'Replied') {
        score += 6
        reasons.push('They have replied to you before.')
      }

      if (c.strength === 'Worked together') {
        score += 8
        reasons.push('You have worked together already.')
      } else if (c.strength === 'In conversation') {
        score += 5
        reasons.push('You are already in conversation.')
      } else if (c.strength === 'Contacted') {
        score += 1
      }

      if (isRelevant(c, type)) {
        score += 6
        reasons.push(`${c.department} is the right desk for ${TYPE_LABEL[type]}.`)
      } else if (c.department) {
        cautions.push(`${c.department} does not usually handle ${TYPE_LABEL[type]}.`)
      } else {
        cautions.push('No department recorded, so relevance to this deal is unknown.')
      }

      score += SENIORITY_WEIGHT[c.seniority]
      if (c.seniority === 'VP or above' || c.seniority === 'Director') {
        cautions.push('Senior enough that they may delegate rather than reply.')
      }

      if (c.preferredChannel) {
        score += 1
        reasons.push(`Best reached on ${c.preferredChannel}.`)
      }

      if (!hasAnyRoute(c)) {
        cautions.push('No email, LinkedIn or Instagram recorded — there is no way to reach them yet.')
      }

      if (c.confidence === 'Unverified') {
        score -= 2
        cautions.push('Details are unverified.')
      }
      if (c.replyState === 'Bounced') {
        score -= 10
        cautions.push('A previous message bounced.')
      }
      if (c.introducedById) reasons.push('You have a warm introduction to them.')

      return { contact: c, score, reasons, cautions }
    })
    // Reachability is a tier, not a weight. Someone with no email, LinkedIn or
    // Instagram cannot be pitched at all, so no amount of being the right person
    // should put them at the top — but they stay listed, because the fix is to
    // find their address rather than to hide them.
    .sort(
      (a, b) =>
        Number(hasAnyRoute(b.contact)) - Number(hasAnyRoute(a.contact)) ||
        b.score - a.score ||
        a.contact.name.localeCompare(b.contact.name),
    )
}

export const TYPE_LABEL: Record<PartnershipType, string> = {
  pr: 'PR and product seeding',
  paid: 'paid partnerships',
  ugc: 'UGC',
  unsure: 'this collaboration',
}

/** Can this person be reached at all? */
export function hasAnyRoute(c: Contact): boolean {
  return Boolean(c.email.trim() || c.linkedin.trim() || c.instagram.trim())
}

/** Which channels are actually usable for this person, from what is recorded. */
export function availableChannels(c: Contact): Channel[] {
  return CHANNELS.filter((ch) =>
    ch === 'Email' ? c.email.trim() !== '' : ch === 'LinkedIn' ? c.linkedin.trim() !== '' : c.instagram.trim() !== '',
  )
}

/* ------------------------------------------------------------- duplicates --- */

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Two records for the same person, before one of them is saved. Matching on a
 * shared email is certain; matching on name alone is a suggestion, because two
 * people at one company genuinely can share a name.
 */
export function findDuplicate(
  candidate: Pick<Contact, 'brandId' | 'name' | 'email'>,
  existing: Contact[],
): { contact: Contact; certain: boolean } | null {
  const sameBrand = existing.filter((c) => !c.deletedAt && c.brandId === candidate.brandId)
  const email = norm(candidate.email)
  if (email) {
    const hit = sameBrand.find((c) => norm(c.email) === email)
    if (hit) return { contact: hit, certain: true }
  }
  const name = norm(candidate.name)
  if (!name) return null
  const hit = sameBrand.find((c) => norm(c.name) === name)
  return hit ? { contact: hit, certain: false } : null
}

/** Fills gaps in the kept record from the duplicate; never overwrites a value
 * that is already there, and keeps the higher confidence of the two. */
export function mergeContacts(keep: Contact, drop: Contact): Contact {
  const pick = (a: string, b: string) => (a.trim() ? a : b)
  const rank = (c: ContactConfidence) => CONFIDENCES.indexOf(c)
  return {
    ...keep,
    role: pick(keep.role, drop.role),
    department: keep.department || drop.department,
    seniority: keep.seniority === 'Unknown' ? drop.seniority : keep.seniority,
    email: pick(keep.email, drop.email),
    phone: pick(keep.phone, drop.phone),
    linkedin: pick(keep.linkedin, drop.linkedin),
    instagram: pick(keep.instagram, drop.instagram),
    location: pick(keep.location, drop.location),
    preferredChannel: keep.preferredChannel || drop.preferredChannel,
    notes: [keep.notes, drop.notes].map((n) => n.trim()).filter(Boolean).join('\n\n'),
    introducedById: keep.introducedById ?? drop.introducedById,
    confidence: rank(keep.confidence) <= rank(drop.confidence) ? keep.confidence : drop.confidence,
    strength: STRENGTHS.indexOf(keep.strength) >= STRENGTHS.indexOf(drop.strength) ? keep.strength : drop.strength,
    lastContactedAt:
      [keep.lastContactedAt, drop.lastContactedAt].filter(Boolean).sort().at(-1) ?? keep.lastContactedAt,
  }
}

/* --------------------------------------------------------------- grouping --- */

export interface DepartmentGroup {
  department: Department | 'Unassigned'
  contacts: Contact[]
  relevant: boolean
}

/** Only departments that actually have someone in them get a node. An empty org
 * chart is a diagram of nothing. */
export function groupByDepartment(contacts: Contact[], type: PartnershipType): DepartmentGroup[] {
  const live = contacts.filter((c) => !c.deletedAt)
  const groups = new Map<Department | 'Unassigned', Contact[]>()
  for (const c of live) {
    const key = c.department || 'Unassigned'
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  return [...groups.entries()]
    .map(([department, list]) => ({
      department,
      contacts: list.sort((a, b) => a.name.localeCompare(b.name)),
      relevant: department !== 'Unassigned' && TYPE_DEPARTMENTS[type].includes(department),
    }))
    .sort((a, b) => Number(b.relevant) - Number(a.relevant) || String(a.department).localeCompare(String(b.department)))
}
