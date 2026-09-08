/**
 * The arithmetic and the vocabulary behind the Contact Nucleus stage.
 *
 * The stage draws a brand as a nucleus, its departments as spheres orbiting it,
 * and its people orbiting their department. Two things carry meaning and nothing
 * else does:
 *
 *   · a department's ring and opacity say whether it is the right desk for this
 *     kind of deal;
 *   · the line from a department to a person carries the real state of that
 *     relationship — warm, replied, never contacted, uncertain, or dead.
 *
 * Sphere colour is deliberately NOT one of those two. Every sphere is a shade of
 * the brand's own colour, so a network reads at a glance as belonging to that
 * brand; status rides on the line and on the small dot above each sphere.
 *
 * Nothing here infers anything about a person. Status is read off fields the
 * user filled in, and "uncertain" means exactly that the user marked the details
 * unverified — never that Director guessed.
 *
 * Pure functions, no React and no three.js: the stage owns the scene graph, this
 * owns the maths, and both can be reasoned about on their own.
 */

import { STRENGTHS, TYPE_DEPARTMENTS, hasAnyRoute, type Contact, type Department } from './contacts.ts'
import { CHANNELS, type Channel, type PartnershipType } from './partnerships.ts'

/* ----------------------------------------------------------- vocabulary --- */

export type NucleusStatus = 'replied' | 'warm' | 'uncontacted' | 'uncertain' | 'invalid'

export const STATUS_META: Record<NucleusStatus, { label: string; color: string }> = {
  replied: { label: 'Replied', color: '#5f7d69' },
  warm: { label: 'Warm', color: '#C8A86B' },
  uncontacted: { label: 'Not contacted', color: '#b4b2ab' },
  uncertain: { label: 'Uncertain', color: '#a9a294' },
  invalid: { label: 'Unreachable', color: '#a05f57' },
}

/** Line weight and treatment per status. Dashes mean "do not trust this yet". */
export const LINE_STYLE: Record<NucleusStatus, { width: number; dash: boolean; opacity: number }> = {
  warm: { width: 0.055, dash: false, opacity: 0.95 },
  replied: { width: 0.06, dash: false, opacity: 0.95 },
  uncontacted: { width: 0.028, dash: false, opacity: 0.6 },
  uncertain: { width: 0.032, dash: true, opacity: 0.75 },
  invalid: { width: 0.03, dash: true, opacity: 0.7 },
}

/**
 * Where one person stands with you, in the stage's five words.
 *
 * Order matters. A bounced address or someone who has left outranks everything
 * else, because a warm history with a person who is no longer there is not a
 * route. Below that, an actual reply beats an ongoing conversation, which beats
 * silence. "Uncertain" is last of the live states and means the user themself
 * marked the details unverified, or recorded no way to reach them at all.
 */
export function contactStatus(c: Contact): NucleusStatus {
  if (c.state !== 'Active' || c.replyState === 'Bounced') return 'invalid'
  if (c.replyState === 'Positive' || c.replyState === 'Replied') return 'replied'
  if (c.strength === 'Worked together' || c.strength === 'In conversation') return 'warm'
  if (c.confidence === 'Unverified' || !hasAnyRoute(c)) return 'uncertain'
  return 'uncontacted'
}

/**
 * How strong the relationship is, 0–1. Drives sphere size and line weight only —
 * it is a picture of the history, not a score to rank people by. `recommendContacts`
 * in lib/contacts does the ranking, and says why.
 */
export function relationshipStrength(c: Contact): number {
  let v = 0.18 + (STRENGTHS.indexOf(c.strength) / (STRENGTHS.length - 1)) * 0.5
  if (c.replyState === 'Positive') v += 0.22
  else if (c.replyState === 'Replied') v += 0.14
  if (c.replyState === 'Bounced' || c.state !== 'Active') v -= 0.3
  if (c.confidence === 'Confirmed') v += 0.08
  else if (c.confidence === 'Unverified') v -= 0.06
  if (!hasAnyRoute(c)) v -= 0.12
  return Math.max(0.1, Math.min(1, v))
}

/** The route you would actually use, from what is recorded. Null when there is none. */
export function preferredRoute(c: Contact): Channel | null {
  if (c.preferredChannel && routeRecorded(c, c.preferredChannel)) return c.preferredChannel
  return CHANNELS.find((ch) => routeRecorded(c, ch)) ?? null
}

function routeRecorded(c: Contact, ch: Channel): boolean {
  return (ch === 'Email' ? c.email : ch === 'LinkedIn' ? c.linkedin : c.instagram).trim() !== ''
}

/* ------------------------------------------------------------- geometry --- */

export type Vec3 = [number, number, number]

/** Straight up, then round — the golden angle, so no two desks crowd each other. */
const GOLDEN = 2.399963

/**
 * Departments spread over a sphere, flattened vertically so their labels stay on
 * roughly one band and remain readable. Deterministic: the same brand always
 * draws the same shape, which is what makes the picture memorable between visits.
 */
export function departmentPositions(count: number, radius = 16.4): Vec3[] {
  const n = Math.max(count, 1)
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / n
    const y = 1 - t * 2
    const r = Math.sqrt(Math.max(0.0001, 1 - y * y))
    const a = i * GOLDEN
    return [Math.cos(a) * r * radius, y * radius * 0.46, Math.sin(a) * r * radius]
  })
}

/**
 * One person's seat in their department's orbit: a ring around the department
 * sphere, tilted into the plane facing away from the nucleus and pushed outward
 * so people never sit between their desk and the brand.
 */
export function orbitPosition(dept: Vec3, index: number, count: number, deptIndex: number): Vec3 {
  const angle = (index / Math.max(count, 1)) * Math.PI * 2 + deptIndex * 0.7
  const orbitR = 4.1 + (count > 3 ? 0.7 : 0)

  const len = Math.hypot(...dept) || 1
  const out: Vec3 = [dept[0] / len, dept[1] / len, dept[2] / len]
  const sideA = normalise(cross(out, [0, 1, 0]))
  const sideB = normalise(cross(out, sideA))

  const cos = Math.cos(angle) * orbitR
  const sin = Math.sin(angle) * orbitR * 0.62
  return [
    dept[0] + sideA[0] * cos + sideB[0] * sin + out[0] * 3.1,
    dept[1] + sideA[1] * cos + sideB[1] * sin + out[1] * 3.1,
    dept[2] + sideA[2] * cos + sideB[2] * sin + out[2] * 3.1,
  ]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function normalise(v: Vec3): Vec3 {
  const l = Math.hypot(...v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Sphere radius for one person. Bigger means a stronger relationship, nothing else. */
export function personRadius(strength: number): number {
  return 0.78 + strength * 0.36
}

/* ------------------------------------------------------------ the model --- */

export interface StagePerson {
  id: string
  name: string
  title: string
  status: NucleusStatus
  strength: number
  channel: Channel | null
}

export interface StageDepartment {
  key: string
  name: string
  relevant: boolean
  people: StagePerson[]
}

/**
 * Everything the stage needs to draw one brand, in the order it will be drawn.
 *
 * Only departments that actually have someone in them get a sphere. An empty org
 * chart is a diagram of nothing, and drawing the twelve desks a company *might*
 * have would be exactly the invention this feature refuses to make.
 */
export function buildStage(contacts: Contact[], type: PartnershipType): StageDepartment[] {
  const live = contacts.filter((c) => !c.deletedAt)
  const relevant = TYPE_DEPARTMENTS[type]
  const groups = new Map<string, Contact[]>()
  for (const c of live) {
    const key = c.department || 'Unassigned'
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  return [...groups.entries()]
    .map(([name, list]) => ({
      key: name,
      name,
      relevant: name !== 'Unassigned' && relevant.includes(name as Department),
      people: list
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          id: c.id,
          name: c.name || 'Unnamed contact',
          title: c.role || 'No role recorded',
          status: contactStatus(c),
          strength: relationshipStrength(c),
          channel: preferredRoute(c),
        })),
    }))
    .sort((a, b) => Number(b.relevant) - Number(a.relevant) || a.name.localeCompare(b.name))
}
