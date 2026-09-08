import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nucleusLayout } from '../src/lib/nucleus.ts'
import { groupByDepartment } from '../src/lib/contacts.ts'

let n = 0
const contact = (patch = {}) => ({
  id: `c${++n}`, brandId: 'b1', name: `Person ${n}`, role: '', department: '', seniority: 'Unknown',
  email: '', phone: '', linkedin: '', instagram: '', location: '', preferredChannel: '',
  source: 'Added manually', notes: '', strength: 'Not contacted', confidence: 'Unverified',
  state: 'Active', replyState: 'None', createdAt: '2026-01-01T00:00:00.000Z', ...patch,
})

const dist = (g, node) => Math.hypot(node.x - g.centre, node.y - g.centre)

test('relevant desks orbit closer to the nucleus than the rest', () => {
  const people = [
    contact({ department: 'PR' }),
    contact({ department: 'Finance' }),
    contact({ department: 'Influencer Marketing' }),
  ]
  const g = nucleusLayout(groupByDepartment(people, 'pr'))
  const byDept = Object.fromEntries(g.contacts.map((c) => [c.department, c]))
  assert.ok(dist(g, byDept.PR) < dist(g, byDept.Finance), 'PR handles seeding, Finance does not')
  assert.ok(dist(g, byDept['Influencer Marketing']) < dist(g, byDept.Finance))
  assert.equal(g.ringRadii.length, 2)
})

test('with no relevant desk everything sits on one ring, not banished outward', () => {
  const people = [contact({ department: 'Finance' }), contact({ department: 'Events' })]
  const g = nucleusLayout(groupByDepartment(people, 'pr'))
  assert.equal(g.ringRadii.length, 1)
  const radii = g.contacts.map((c) => dist(g, c))
  assert.ok(Math.abs(radii[0] - radii[1]) < 0.001, 'both desks are equally distant')
  assert.ok(g.contacts.every((c) => c.ring === 0))
})

test('every contact is placed exactly once, and clear of the nucleus', () => {
  const people = [
    contact({ department: 'PR' }), contact({ department: 'PR' }), contact({ department: 'PR' }),
    contact({ department: '' }), contact({ department: 'Agency' }),
  ]
  const g = nucleusLayout(groupByDepartment(people, 'pr'))
  assert.equal(g.contacts.length, people.length)
  assert.equal(new Set(g.contacts.map((c) => c.contactId)).size, people.length)
  for (const c of g.contacts) {
    assert.ok(dist(g, c) - c.radius > g.nucleusRadius, `${c.contactId} overlaps the nucleus`)
    assert.ok(c.x > 0 && c.x < g.size && c.y > 0 && c.y < g.size, 'stays inside the viewBox')
  }
})

test('contacts sharing a desk fan out instead of stacking', () => {
  const people = [contact({ department: 'PR' }), contact({ department: 'PR' }), contact({ department: 'PR' })]
  const g = nucleusLayout(groupByDepartment(people, 'pr'))
  const points = g.contacts.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`)
  assert.equal(new Set(points).size, 3, 'no two spheres share a centre')
})

test('a lone contact sits on its department mid-angle', () => {
  const people = [contact({ department: 'PR' })]
  const g = nucleusLayout(groupByDepartment(people, 'pr'))
  const dept = g.departments[0]
  assert.equal(g.contacts[0].x.toFixed(6), dept.x.toFixed(6))
  assert.equal(g.contacts[0].y.toFixed(6), dept.y.toFixed(6))
})

test('spheres shrink as the network grows, but never past legibility', () => {
  const few = nucleusLayout(groupByDepartment([contact({ department: 'PR' })], 'pr'))
  const many = nucleusLayout(
    groupByDepartment(Array.from({ length: 30 }, () => contact({ department: 'PR' })), 'pr'),
  )
  assert.ok(many.contacts[0].radius < few.contacts[0].radius)
  assert.ok(many.contacts[0].radius >= many.size * 0.026)
})

test('an empty network draws nothing but still returns a nucleus', () => {
  const g = nucleusLayout(groupByDepartment([], 'pr'))
  assert.deepEqual(g.contacts, [])
  assert.deepEqual(g.departments, [])
  assert.ok(g.nucleusRadius > 0)
})
