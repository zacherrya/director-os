import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyContact, recommendContacts, isRelevant, availableChannels, hasAnyRoute,
  findDuplicate, mergeContacts, groupByDepartment,
} from '../src/lib/contacts.ts'

const c = (patch = {}) => ({ ...emptyContact('b1', patch.id ?? 'c' + Math.random()), ...patch })

test('the right desk outranks the grander title', () => {
  const manager = c({ id: 'm', name: 'Priya', department: 'Creator Partnerships', seniority: 'Manager', email: 'p@x.com' })
  const vp = c({ id: 'v', name: 'Rohan', department: 'Finance', seniority: 'VP or above', email: 'r@x.com' })
  const [top] = recommendContacts([vp, manager], 'paid')
  assert.equal(top.contact.id, 'm')
  assert.match(top.reasons.join(' '), /Creator Partnerships is the right desk for paid partnerships/)
})

test('a warm thread beats a better-titled stranger', () => {
  const warm = c({ id: 'w', name: 'Rhea', department: 'PR', seniority: 'Coordinator', instagram: '@rhea', replyState: 'Positive', strength: 'In conversation' })
  const cold = c({ id: 'k', name: 'Aarav', department: 'Creator Partnerships', seniority: 'Manager', email: 'a@x.com' })
  const [top] = recommendContacts([cold, warm], 'paid')
  assert.equal(top.contact.id, 'w')
  assert.match(top.reasons.join(' '), /replied positively before/)
})

test('someone with no route at all is pushed down and says so', () => {
  const unreachable = c({ id: 'u', name: 'Ghost', department: 'Creator Partnerships', seniority: 'Manager' })
  const reachable = c({ id: 'r', name: 'Real', department: 'Content', seniority: 'Coordinator', email: 'r@x.com' })
  const ranked = recommendContacts([unreachable, reachable], 'paid')
  assert.equal(ranked[0].contact.id, 'r')
  assert.match(ranked.find((x) => x.contact.id === 'u').cautions.join(' '), /no way to reach them yet/)
})

test('a wrong-desk contact is still listed, with the mismatch stated', () => {
  const pr = c({ id: 'p', name: 'Ananya', department: 'PR', seniority: 'Manager', email: 'a@x.com' })
  const [only] = recommendContacts([pr], 'paid')
  assert.equal(only.contact.id, 'p')
  assert.match(only.cautions.join(' '), /PR does not usually handle paid partnerships/)
})

test('a bounced address is heavily penalised and flagged', () => {
  const bounced = c({ id: 'b', name: 'Old', department: 'Creator Partnerships', seniority: 'Manager', email: 'o@x.com', replyState: 'Bounced' })
  const plain = c({ id: 'n', name: 'New', department: 'Content', email: 'n@x.com' })
  const ranked = recommendContacts([bounced, plain], 'paid')
  assert.equal(ranked[0].contact.id, 'n')
  assert.match(ranked.find((x) => x.contact.id === 'b').cautions.join(' '), /bounced/)
})

test('people who left the company are excluded from recommendations entirely', () => {
  const gone = c({ id: 'g', name: 'Gone', department: 'Creator Partnerships', seniority: 'Manager', email: 'g@x.com', state: 'Left company' })
  assert.equal(recommendContacts([gone], 'paid').length, 0)
})

test('channels offered are only the ones actually recorded', () => {
  assert.deepEqual(availableChannels(c({ email: 'a@x.com' })), ['Email'])
  assert.deepEqual(availableChannels(c({ instagram: '@a', linkedin: 'in/a' })), ['Instagram', 'LinkedIn'])
  assert.deepEqual(availableChannels(c({})), [])
  assert.equal(hasAnyRoute(c({})), false)
})

test('routing differs by deal type', () => {
  const content = c({ department: 'Content' })
  assert.equal(isRelevant(content, 'ugc'), true)
  assert.equal(isRelevant(content, 'pr'), false)
  const pr = c({ department: 'PR' })
  assert.equal(isRelevant(pr, 'pr'), true)
  assert.equal(isRelevant(pr, 'ugc'), false)
})

test('a shared email is a certain duplicate; a shared name is only a suggestion', () => {
  const existing = [c({ id: 'e', brandId: 'b1', name: 'Priya Sharma', email: 'priya@rubans.com' })]
  assert.deepEqual(findDuplicate({ brandId: 'b1', name: 'Different Person', email: 'PRIYA@rubans.com ' }, existing), { contact: existing[0], certain: true })
  assert.equal(findDuplicate({ brandId: 'b1', name: 'priya sharma', email: '' }, existing).certain, false)
  assert.equal(findDuplicate({ brandId: 'b2', name: 'Priya Sharma', email: 'priya@rubans.com' }, existing), null, 'a different brand is not a duplicate')
})

test('merging fills gaps without overwriting what is already known', () => {
  const keep = c({ id: 'k', name: 'Priya', role: 'Partnerships Manager', email: 'p@rubans.com', notes: 'Met at event', confidence: 'Confirmed', strength: 'Contacted' })
  const drop = c({ id: 'd', name: 'Priya', role: 'Manager', email: 'other@rubans.com', phone: '+91 90000 00000', linkedin: 'in/priya', notes: 'Handles gifting', confidence: 'Unverified', strength: 'In conversation' })
  const m = mergeContacts(keep, drop)
  assert.equal(m.role, 'Partnerships Manager', 'the survivor keeps its own value')
  assert.equal(m.email, 'p@rubans.com')
  assert.equal(m.phone, '+91 90000 00000', 'a gap is filled from the duplicate')
  assert.equal(m.linkedin, 'in/priya')
  assert.equal(m.confidence, 'Confirmed', 'the higher confidence survives')
  assert.equal(m.strength, 'In conversation', 'the further-along relationship survives')
  assert.match(m.notes, /Met at event[\s\S]*Handles gifting/)
})

test('departments with nobody in them get no node, and relevant ones sort first', () => {
  const groups = groupByDepartment([c({ department: 'Finance', name: 'F' }), c({ department: 'Creator Partnerships', name: 'C' }), c({ department: '', name: 'U' })], 'paid')
  assert.deepEqual(groups.map((g) => g.department), ['Creator Partnerships', 'Finance', 'Unassigned'])
  assert.equal(groups[0].relevant, true)
  assert.equal(groups.length, 3, 'only departments that have someone appear')
})

test('nothing is ever invented for a blank contact', () => {
  const blank = emptyContact('b1', 'x')
  for (const f of ['name', 'role', 'email', 'phone', 'linkedin', 'instagram', 'location', 'notes']) {
    assert.equal(blank[f], '', `${f} must start empty`)
  }
  assert.equal(blank.confidence, 'Unverified')
  assert.equal(blank.source, 'Added manually')
  assert.equal(blank.seniority, 'Unknown')
})
