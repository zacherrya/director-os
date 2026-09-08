import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STATUS_META, buildStage, contactStatus, departmentPositions, orbitPosition,
  personRadius, preferredRoute, relationshipStrength,
} from '../src/lib/nucleus.ts'

let n = 0
const contact = (patch = {}) => ({
  id: `c${++n}`, brandId: 'b1', name: `Person ${n}`, role: '', department: '', seniority: 'Unknown',
  email: '', phone: '', linkedin: '', instagram: '', location: '', preferredChannel: '',
  source: 'Added manually', notes: '', strength: 'Not contacted', confidence: 'Likely',
  state: 'Active', replyState: 'None', createdAt: '2026-01-01T00:00:00.000Z', ...patch,
})

const len = (v) => Math.hypot(...v)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/* --------------------------------------------------------------- status --- */

test('someone who has left, or whose mail bounced, is unreachable whatever the history', () => {
  const warmButGone = contact({ strength: 'Worked together', replyState: 'Positive', state: 'Left company', email: 'a@b.com' })
  assert.equal(contactStatus(warmButGone), 'invalid')
  assert.equal(contactStatus(contact({ replyState: 'Bounced', strength: 'In conversation' })), 'invalid')
})

test('a reply outranks an open conversation, which outranks silence', () => {
  assert.equal(contactStatus(contact({ replyState: 'Positive', email: 'a@b.com' })), 'replied')
  assert.equal(contactStatus(contact({ strength: 'In conversation', email: 'a@b.com' })), 'warm')
  assert.equal(contactStatus(contact({ email: 'a@b.com' })), 'uncontacted')
})

test('unverified details, or no route at all, read as uncertain rather than as a clean record', () => {
  assert.equal(contactStatus(contact({ email: 'a@b.com', confidence: 'Unverified' })), 'uncertain')
  assert.equal(contactStatus(contact({ confidence: 'Confirmed' })), 'uncertain', 'no email, LinkedIn or Instagram')
})

test('every status has a label and a colour to draw it with', () => {
  for (const s of ['replied', 'warm', 'uncontacted', 'uncertain', 'invalid']) {
    assert.match(STATUS_META[s].color, /^#[0-9a-f]{6}$/i)
    assert.ok(STATUS_META[s].label.length > 0)
  }
})

/* ------------------------------------------------------------- strength --- */

test('strength rises with the relationship and never leaves 0–1', () => {
  const cold = relationshipStrength(contact())
  const talking = relationshipStrength(contact({ strength: 'In conversation', email: 'a@b.com' }))
  const done = relationshipStrength(contact({ strength: 'Worked together', replyState: 'Positive', confidence: 'Confirmed', email: 'a@b.com' }))
  assert.ok(cold < talking && talking < done, `${cold} < ${talking} < ${done}`)
  for (const v of [cold, talking, done]) assert.ok(v >= 0.1 && v <= 1)
})

test('a bounced address weakens the line even after a good history', () => {
  const before = relationshipStrength(contact({ strength: 'Worked together', email: 'a@b.com', replyState: 'Positive' }))
  const after = relationshipStrength(contact({ strength: 'Worked together', email: 'a@b.com', replyState: 'Bounced' }))
  assert.ok(after < before)
})

/* ---------------------------------------------------------------- route --- */

test('the preferred channel is only used when that route is actually recorded', () => {
  assert.equal(preferredRoute(contact({ preferredChannel: 'LinkedIn', linkedin: 'in/x' })), 'LinkedIn')
  assert.equal(preferredRoute(contact({ preferredChannel: 'LinkedIn', email: 'a@b.com' })), 'Email',
    'a stated preference with nothing behind it must not become the route')
  assert.equal(preferredRoute(contact()), null)
})

/* ------------------------------------------------------------- geometry --- */

test('departments sit on a flattened sphere, evenly spread and deterministic', () => {
  const a = departmentPositions(9)
  assert.equal(a.length, 9)
  assert.deepEqual(a, departmentPositions(9), 'the same brand always draws the same shape')
  for (const p of a) assert.ok(len(p) > 3 && len(p) < 17.5, `${len(p)} is off the shell`)
  // Flattened: nothing should be stacked straight above the nucleus.
  for (const p of a) assert.ok(Math.abs(p[1]) < 8)
})

test('no two departments land on top of each other', () => {
  const ps = departmentPositions(13)
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      assert.ok(dist(ps[i], ps[j]) > 2.4, `departments ${i} and ${j} overlap`)
    }
  }
})

test('people orbit their own department, not the nucleus', () => {
  const dept = departmentPositions(4)[0]
  const seats = [0, 1, 2].map((i) => orbitPosition(dept, i, 3, 0))
  for (const s of seats) {
    assert.ok(dist(s, dept) < 9, 'stays in its department orbit')
    assert.ok(len(s) > len(dept), 'sits outside its department, never between it and the brand')
  }
  const keys = seats.map((s) => s.map((v) => v.toFixed(3)).join(','))
  assert.equal(new Set(keys).size, 3, 'no two people share a seat')
})

test('a stronger relationship draws a bigger sphere', () => {
  assert.ok(personRadius(0.9) > personRadius(0.2))
  assert.ok(personRadius(0) > 0.5)
})

/* ---------------------------------------------------------------- stage --- */

test('only departments with someone in them get a sphere', () => {
  const stage = buildStage([contact({ department: 'PR' }), contact({ department: 'PR' })], 'pr')
  assert.equal(stage.length, 1)
  assert.equal(stage[0].people.length, 2)
})

test('the desks that handle this deal come first and are marked relevant', () => {
  const stage = buildStage([
    contact({ department: 'Finance' }),
    contact({ department: 'PR' }),
    contact({ department: 'Influencer Marketing' }),
  ], 'pr')
  assert.deepEqual(stage.map((d) => d.relevant), [true, true, false])
  assert.equal(stage.at(-1).name, 'Finance')
})

test('a contact with no department is grouped, never guessed into one', () => {
  const stage = buildStage([contact({ department: '' })], 'paid')
  assert.equal(stage[0].name, 'Unassigned')
  assert.equal(stage[0].relevant, false)
})

test('deleted contacts leave the stage entirely', () => {
  const stage = buildStage([
    contact({ department: 'PR' }),
    contact({ department: 'PR', deletedAt: '2026-02-02T00:00:00.000Z' }),
  ], 'pr')
  assert.equal(stage[0].people.length, 1)
})

test('an empty brand draws no departments at all', () => {
  assert.deepEqual(buildStage([], 'pr'), [])
})

test('a person with no name still carries a label and a route of "none"', () => {
  const stage = buildStage([contact({ name: '', role: '', department: 'PR' })], 'pr')
  assert.equal(stage[0].people[0].name, 'Unnamed contact')
  assert.equal(stage[0].people[0].title, 'No role recorded')
  assert.equal(stage[0].people[0].channel, null)
})
