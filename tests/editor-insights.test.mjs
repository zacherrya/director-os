import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addClip, addSource, newProject, updateClip, withText } from '../src/lib/editor/model.ts'
import { analyzeEdit, crowdedMoments, readableDuration, PUNCH_IN } from '../src/lib/editor/insights.ts'

function cut(ranges, { sameSource = true } = {}) {
  let p = newProject({ id: 'ep', format: '9:16' })
  p = addSource(p, { id: 'a', name: 'a', kind: 'video', path: '/a', duration: 100, width: 1, height: 1, hasAudio: true })
  p = addSource(p, { id: 'b', name: 'b', kind: 'video', path: '/b', duration: 100, width: 1, height: 1, hasAudio: true })
  ranges.forEach(([i, o], k) => {
    p = addClip(p, sameSource || k % 2 === 0 ? 'a' : 'b', { id: `c${k}` })
    p = updateClip(p, `c${k}`, { in: i, out: o })
  })
  return p
}
const text = (start, duration = 2, extra = {}) => ({ text: 'A hook line', start, duration, style: 'clean-caption', animation: 'rise', position: 'center', ...extra })
const find = (list, prefix) => list.find((x) => x.id.startsWith(prefix))

test('late hook text is flagged, and the fix moves it to the first frame', () => {
  let p = withText(cut([[0, 4]]), text(2))
  const hook = find(analyzeEdit(p), 'hook-text-late')
  assert.equal(hook.severity, 'flag')
  p = hook.fix.apply(p)
  assert.equal(p.texts[0].start, 0)
  assert.equal(find(analyzeEdit(p), 'hook-text-late'), undefined)
})

test('three things starting in one half-second fails the audit; staggering fixes it', () => {
  let p = cut([[0, 1], [5, 8]], { sameSource: false })
  p = withText(p, text(0.9))
  p = withText(p, text(1.05))
  assert.equal(crowdedMoments(p).length, 1)
  const crowded = find(analyzeEdit(p), 'crowded')
  assert.equal(crowded.severity, 'flag')
  p = crowded.fix.apply(p)
  assert.equal(crowdedMoments(p).length, 0, 'still crowded after the fix')
})

test('a clean edit is told so', () => {
  let p = cut([[0, 3], [10, 13], [20, 23]], { sameSource: false })
  p = withText(p, text(0, 2))
  assert.ok(find(analyzeEdit(p), 'audit-clean'))
})

test('a caption too short to read is caught and lengthened to readable', () => {
  let p = withText(cut([[0, 4]]), text(0, 0.6, { text: 'one two three four five six' }))
  const short = find(analyzeEdit(p), 'short-')
  assert.ok(short)
  p = short.fix.apply(p)
  assert.ok(Math.abs(p.texts[0].duration - readableDuration('one two three four five six', 'rise')) < 1e-9)
})

test('an unmasked jump cut gets a punch-in; a masked one is left alone', () => {
  let p = cut([[0, 2], [2.8, 5]])
  const jump = find(analyzeEdit(p), 'jump-')
  assert.ok(jump)
  p = jump.fix.apply(p)
  assert.equal(p.clips[1].zoom, PUNCH_IN)
  assert.equal(find(analyzeEdit(p), 'jump-'), undefined)
})

test('a join that removed a few frames is merged back into one shot', () => {
  let p = cut([[0, 2], [2.05, 4]])
  const merge = find(analyzeEdit(p), 'merge-')
  assert.ok(merge)
  p = merge.fix.apply(p)
  assert.equal(p.clips.length, 1)
  assert.deepEqual([p.clips[0].in, p.clips[0].out], [0, 4])
})

test('cuts between different shots are not jump cuts', () => {
  const p = cut([[0, 2], [2.5, 5]], { sameSource: false })
  assert.equal(find(analyzeEdit(p), 'jump-'), undefined)
})

test('more than one flash is called out', () => {
  let p = cut([[0, 2], [10, 12], [20, 22]], { sameSource: false })
  p = updateClip(p, 'c1', { transition: { preset: 'flash', duration: 0.24 } })
  p = updateClip(p, 'c2', { transition: { preset: 'flash', duration: 0.24 } })
  assert.ok(find(analyzeEdit(p), 'flashes'))
})

test('untagged clips get a one-click match to the script', () => {
  const episode = { length: 10, scenes: [
    { id: 's1', index: 0, purpose: 'Hook', start: 0, end: 2 },
    { id: 's2', index: 1, purpose: 'CTA', start: 2, end: 4 },
  ] }
  let p = withText(cut([[0, 2], [10, 12]], { sameSource: false }), text(0))
  const untagged = find(analyzeEdit(p, episode), 'untagged')
  p = untagged.fix.apply(p)
  assert.deepEqual(p.clips.map((c) => c.sceneId), ['s1', 's2'])
  assert.equal(find(analyzeEdit(p, episode), 'untagged'), undefined)
})

test('a beat that ran long against the plan is noted', () => {
  const episode = { length: 10, scenes: [{ id: 's1', index: 0, purpose: 'Hook', start: 0, end: 2 }] }
  let p = cut([[0, 6]])
  p = updateClip(p, 'c0', { sceneId: 's1' })
  assert.ok(find(analyzeEdit(p, episode), 'long-s1'))
})

test('flags sort ahead of notes, notes ahead of good news', () => {
  let p = withText(cut([[0, 2], [2.8, 5]]), text(2))
  const order = analyzeEdit(p).map((x) => x.severity)
  assert.deepEqual(order, [...order].sort((a, b) => ['flag', 'note', 'good'].indexOf(a) - ['flag', 'note', 'good'].indexOf(b)))
})

test('an empty edit has nothing to say', () => {
  assert.deepEqual(analyzeEdit(newProject({ id: 'ep', format: '9:16' })), [])
})
