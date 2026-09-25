import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wrapTokens } from '../src/lib/editor/render.ts'
import { framePlan } from '../src/lib/editor/export.ts'
import { addClip, addSource, newProject, updateClip } from '../src/lib/editor/model.ts'

/* ------------------------------------------------------------------ wrap --- */

test('words stay on one line while they fit', () => {
  const { words, lineWidths } = wrapTokens([30, 40, 20], 10, 200)
  assert.deepEqual(words.map((w) => [w.line, w.x]), [[0, 0], [0, 40], [0, 90]])
  assert.deepEqual(lineWidths, [110])
})

test('a word that would overflow starts the next line', () => {
  const { words, lineWidths } = wrapTokens([60, 60, 60], 10, 140)
  assert.deepEqual(words.map((w) => w.line), [0, 0, 1])
  assert.deepEqual(lineWidths, [130, 60])
})

test('a word wider than the line gets a line to itself rather than being split', () => {
  const { words } = wrapTokens([20, 500, 20], 10, 100)
  assert.deepEqual(words.map((w) => w.line), [0, 1, 2])
})

test('no words, no lines', () => {
  assert.deepEqual(wrapTokens([], 10, 100), { words: [], lineWidths: [] })
})

/* ------------------------------------------------------------ frame plan --- */

function cut(ranges) {
  let p = newProject({ id: 'ep', format: '9:16' })
  p = addSource(p, { id: 's', name: 's', kind: 'video', path: '/s', duration: 100, width: 1, height: 1, hasAudio: true })
  ranges.forEach(([i, o], k) => {
    p = addClip(p, 's', { id: `c${k}` })
    p = updateClip(p, `c${k}`, { in: i, out: o })
  })
  return p
}

test('one frame per 1/fps of runtime, rounded up', () => {
  assert.equal(framePlan(cut([[0, 1]])).frames, 30)
  assert.equal(framePlan(cut([[0, 1.01]])).frames, 31)
})

test('every clip is asked for source times in strictly rising order — one decode pass each', () => {
  let p = cut([[10, 12], [3, 5]])
  p = updateClip(p, 'c1', { transition: { preset: 'dissolve', duration: 0.5 } })
  const { needs } = framePlan(p)
  for (const [, times] of needs) for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1])
  assert.ok(Math.abs(needs.get('c0')[0] - 10) < 1e-9)
  assert.ok(Math.abs(needs.get('c1')[0] - 3) < 1e-9)
})

test('a transition asks both clips for the frames it overlaps', () => {
  let p = cut([[0, 2], [0, 2]])
  p = updateClip(p, 'c1', { transition: { preset: 'dissolve', duration: 0.5 } })
  const { needs, frames } = framePlan(p)
  // Total asks = frames + the frames inside the overlap, which need two sources.
  const asks = [...needs.values()].reduce((a, t) => a + t.length, 0)
  assert.equal(frames, 105)
  assert.equal(asks, 105 + 15)
})
