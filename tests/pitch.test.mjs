import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPitch, formulaRows, pitchProof, pitchReady, askPhrase } from '../src/lib/pitch.ts'

const kit = { displayName: 'Styled by Shivangi', tagline: '', contactEmail: '', location: '', positioning: '', audienceNote: '', collaborationNote: '', featuredPostIds: [] }
const brand = { id: 'b1', name: 'Nykaa', category: 'Beauty', website: '', contactName: 'Priya Sharma', contactEmail: '', notes: '', createdAt: '2026-01-01' }

const opportunity = (patch = {}) => ({
  id: 'o1', brandId: 'b1', type: 'paid', stage: 'Ready to pitch',
  title: 'One Lipstick, Three Outfits',
  concept: 'Three completely different looks built around one shade.',
  brandObservation: 'Their festive edit was all heavy glam, nothing for a workday.',
  fit: 'Beauty and styling, same audience.',
  audienceWhy: 'It combines beauty with practical styling rather than another product review.',
  formats: ['Sponsored Reel'], valueOffered: [], fee: '', nextAction: '', nextActionDate: '',
  episodeIds: [], platforms: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', ...patch,
})

const post = (id, views, likes) => ({
  id, platform: 'instagram', title: id, permalink: '#', publishedAt: '2026-08-01', format: 'Reel',
  views, reach: null, likes, comments: 10, shares: 5, saves: 20, avgWatchTime: null, duration: 14,
})
const posts = [post('a', 9000, 700), post('b', 7000, 500), post('c', 5000, 300)]

test('a UGC pitch carries no audience numbers at all', () => {
  const text = buildPitch(opportunity({ type: 'ugc', formats: ['Product demo'] }), brand, kit, pitchProof(posts))
  assert.ok(!/\d[\d,.]*\s*(views|K\b|M\b)/i.test(text), `numbers leaked into a UGC pitch:\n${text}`)
  assert.ok(!/follower|subscriber|engagement/i.test(text))
  assert.match(text, /your own social channels or campaigns/)
})

test('a paid pitch leads with the idea and carries proof with its sample size', () => {
  const proof = pitchProof(posts)
  const text = buildPitch(opportunity(), brand, kit, proof)
  assert.match(text, /One Lipstick, Three Outfits/)
  assert.match(text, /last 3 Instagram posts/)
  assert.match(text, /7K views/)
  assert.ok(text.indexOf('One Lipstick') < text.indexOf('last 3 Instagram posts'), 'idea must come before proof')
})

test('a PR pitch promises no content and names no deliverable', () => {
  const text = buildPitch(opportunity({ type: 'pr', formats: [] }), brand, kit, pitchProof(posts))
  assert.match(text, /where they genuinely fit/)
  assert.ok(!/Reel|Short|Story|deliverable/i.test(text), `a PR pitch must not name a deliverable:\n${text}`)
  assert.ok(!/\bI will\b|\bI'll post\b|in exchange/i.test(text))
})

test('the greeting uses a contact first name when there is one', () => {
  assert.match(buildPitch(opportunity(), brand, kit, null), /^Hi Priya,/)
  assert.match(buildPitch(opportunity(), { ...brand, contactName: '' }, kit, null), /^Hi Nykaa,/)
})

test('proof is null without enough published history, and the pitch simply omits it', () => {
  assert.equal(pitchProof([]), null)
  assert.equal(pitchProof([post('a', 9000, 700)]), null, 'one post is below the reliability floor')
  const text = buildPitch(opportunity(), brand, kit, null)
  assert.ok(!/typical one does/.test(text))
  assert.match(text, /One Lipstick, Three Outfits/)
})

test('the formula blocks generation until personal, relevance and idea are covered', () => {
  assert.equal(pitchReady(formulaRows(opportunity(), null)), true)
  assert.equal(pitchReady(formulaRows(opportunity({ brandObservation: '' }), null)), false)
  assert.equal(pitchReady(formulaRows(opportunity({ fit: '' }), null)), false)
  assert.equal(pitchReady(formulaRows(opportunity({ concept: '' }), null)), false)
})

test('proof is marked not-applicable for UGC rather than missing', () => {
  const row = formulaRows(opportunity({ type: 'ugc' }), null).find((r) => r.step === 'Proof')
  assert.equal(row.notApplicable, true)
  assert.equal(row.met, true, 'a UGC pitch must not be blocked for lacking numbers')
})

test('an opportunity saved before brandObservation existed does not crash the formula', () => {
  const legacy = opportunity()
  delete legacy.brandObservation
  const rows = formulaRows(legacy, null)
  assert.equal(rows.find((r) => r.step === 'Personal').met, false)
  assert.doesNotThrow(() => buildPitch(legacy, brand, kit, null))
})

test('the ask names the formats for paid and UGC, and stays open-ended for PR', () => {
  assert.match(askPhrase(opportunity()), /paid partnership — Sponsored Reel/)
  assert.match(askPhrase(opportunity({ type: 'ugc', formats: ['Product demo'] })), /UGC — Product demo/)
  assert.equal(askPhrase(opportunity({ type: 'pr' })), 'a PR collaboration')
})

test('joined fragments always land as clean sentences, whatever punctuation was typed', () => {
  const noStops = opportunity({
    type: 'ugc', formats: ['Product demo'],
    brandObservation: 'Your festive edit was all going-out glam',
    audienceWhy: 'It is practical styling rather than a review',
    concept: 'three looks from one shade',
  })
  const text = buildPitch(noStops, brand, kit, null)
  assert.ok(!/[a-z] [A-Z][a-z]+ goal is/.test(text), `a full stop is missing before "The goal":\n${text}`)
  assert.match(text, /rather than a review\. The goal is/)
  assert.match(text, /one shade\./)
  assert.ok(!/\. — /.test(text), 'a stop should never be followed by a dash join')
})

test('a display name with no person in it does not invent a first name', () => {
  const plain = { ...kit, displayName: 'The Wardrobe Files' }
  assert.match(buildPitch(opportunity(), brand, plain, null), /I'm the personal stylist and creator behind The Wardrobe Files\./)
  const single = { ...kit, displayName: 'Shivangi' }
  assert.match(buildPitch(opportunity(), brand, single, null), /I'm Shivangi, the personal stylist/)
})
