import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addClip, addSource, cutMarkers, episodeAsCut, layersAt, layout, matchClipsToBeats, moveClip,
  newProject, removeClip, splitAt, totalDuration, transitionLength, trimClip, updateClip,
  MIN_CLIP_SECONDS, IMAGE_DEFAULT_SECONDS,
} from '../src/lib/editor/model.ts'

let n = 0
const id = () => `id${++n}`
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

function project(lengths, opts = {}) {
  let p = newProject({ id: 'ep', format: '9:16' })
  p = addSource(p, { id: 'src', name: 'a.mov', kind: 'video', path: '/a.mov', duration: 100, width: 1080, height: 1920, hasAudio: true })
  let at = 0
  for (const len of lengths) {
    p = addClip(p, 'src', { id: id() })
    const clip = p.clips[p.clips.length - 1]
    p = updateClip(p, clip.id, { in: at, out: at + len, ...opts })
    at += len
  }
  return p
}

const tr = (preset, duration) => ({ preset, duration })

/* ---------------------------------------------------------------- layout --- */

test('clips without transitions play back to back', () => {
  const p = project([2, 3, 1])
  const placed = layout(p.clips)
  assert.deepEqual(placed.map((x) => [x.start, x.end]), [[0, 2], [2, 5], [5, 6]])
  assert.equal(totalDuration(p), 6)
})

test('a transition overlaps the clips and shortens the cut by its length', () => {
  let p = project([2, 3])
  p = updateClip(p, p.clips[1].id, { transition: tr('dissolve', 0.4) })
  const placed = layout(p.clips)
  assert.ok(near(placed[1].start, 1.6))
  assert.ok(near(totalDuration(p), 4.6))
  assert.deepEqual(placed[1].transition && [placed[1].transition.start, placed[1].transition.end].map((x) => +x.toFixed(6)), [1.6, 2])
})

test('a transition is capped at half the shorter clip', () => {
  let p = project([0.5, 3])
  p = updateClip(p, p.clips[1].id, { transition: tr('dissolve', 2) })
  assert.ok(near(transitionLength(p.clips[0], p.clips[1]), 0.25))
})

test('a transition on the first clip is ignored — there is nothing to come from', () => {
  let p = project([2, 2])
  p = updateClip(p, p.clips[0].id, { transition: tr('flash', 0.3) })
  assert.equal(layout(p.clips)[0].transition, null)
  assert.equal(totalDuration(p), 4)
})

test('a cut transition takes no time', () => {
  let p = project([2, 2])
  p = updateClip(p, p.clips[1].id, { transition: tr('cut', 0.5) })
  assert.equal(totalDuration(p), 4)
})

test('never more than two clips on screen, however the transitions stack', () => {
  let p = project([1, 1, 1, 1])
  for (const c of p.clips.slice(1)) p = updateClip(p, c.id, { transition: tr('dissolve', 5) })
  const placed = layout(p.clips)
  for (let t = 0; t < totalDuration(p); t += 0.01) {
    const onScreen = placed.filter((x) => t >= x.start && t < x.end)
    assert.ok(onScreen.length <= 2, `${onScreen.length} clips at ${t}`)
  }
})

/* -------------------------------------------------------------- layersAt --- */

test('a solo frame maps timeline time onto source time', () => {
  const p = project([2, 3])
  const l = layersAt(layout(p.clips), 3)
  assert.equal(l.kind, 'solo')
  assert.equal(l.layer.clip.id, p.clips[1].id)
  assert.ok(near(l.layer.sourceTime, 3)) // clip 2 starts at source 2, 1s in
})

test('inside a transition both shots are given, with progress', () => {
  let p = project([2, 2])
  p = updateClip(p, p.clips[1].id, { transition: tr('dissolve', 0.4) })
  const l = layersAt(layout(p.clips), 1.8)
  assert.equal(l.kind, 'transition')
  assert.ok(near(l.progress, 0.5))
  assert.equal(l.out.clip.id, p.clips[0].id)
  assert.equal(l.in.clip.id, p.clips[1].id)
})

test('the very end shows the last frame rather than black', () => {
  const p = project([2])
  const l = layersAt(layout(p.clips), 2)
  assert.equal(l.kind, 'solo')
})

test('an empty edit has nothing on screen', () => {
  assert.equal(layersAt([], 1).kind, 'empty')
})

/* ----------------------------------------------------------------- edits --- */

test('splitting at the playhead makes two clips that play the same footage', () => {
  let p = project([4])
  p = splitAt(p, 1.5, id)
  assert.equal(p.clips.length, 2)
  assert.deepEqual([p.clips[0].in, p.clips[0].out, p.clips[1].in, p.clips[1].out], [0, 1.5, 1.5, 4])
  assert.equal(totalDuration(p), 4)
})

test('a split inside a transition is refused', () => {
  let p = project([2, 2])
  p = updateClip(p, p.clips[1].id, { transition: tr('dissolve', 0.4) })
  assert.equal(splitAt(p, 1.8, id).clips.length, 2)
})

test('a split that would leave a flash frame is refused', () => {
  const p = project([2])
  assert.equal(splitAt(p, MIN_CLIP_SECONDS / 2, id).clips.length, 1)
})

test('trimming clamps to the media and to a minimum length', () => {
  let p = project([2])
  const c = p.clips[0].id
  p = trimClip(p, c, 'in', -5)
  assert.equal(p.clips[0].in, 0)
  p = trimClip(p, c, 'out', 500)
  assert.equal(p.clips[0].out, 100)
  p = trimClip(p, c, 'in', 100)
  assert.ok(near(p.clips[0].in, 100 - MIN_CLIP_SECONDS))
})

test('moving and removing reorder the cut', () => {
  let p = project([1, 2, 3])
  const [a, b, c] = p.clips.map((x) => x.id)
  p = moveClip(p, c, 0)
  assert.deepEqual(p.clips.map((x) => x.id), [c, a, b])
  p = removeClip(p, a)
  assert.deepEqual(p.clips.map((x) => x.id), [c, b])
})

test('re-importing the same file keeps one source', () => {
  let p = project([1])
  p = addSource(p, { id: 'other', name: 'a.mov', kind: 'video', path: '/a.mov', duration: 100, width: 1, height: 1, hasAudio: true })
  assert.equal(p.sources.length, 1)
})

test('a still image gets a default length', () => {
  let p = newProject({ id: 'ep', format: '9:16' })
  p = addSource(p, { id: 'img', name: 'a.png', kind: 'image', path: '/a.png', duration: 0, width: 1, height: 1, hasAudio: false })
  p = addClip(p, 'img')
  assert.equal(p.clips[0].out, IMAGE_DEFAULT_SECONDS)
  assert.equal(p.clips[0].volume, 0)
})

/* ------------------------------------------------------------ plan vs cut --- */

const episode = {
  id: 'ep', length: 10, format: '9:16',
  scenes: [
    { id: 's1', index: 0, purpose: 'Hook', start: 0, end: 2 },
    { id: 's2', index: 1, purpose: 'Problem', start: 2, end: 6 },
    { id: 's3', index: 2, purpose: 'CTA', start: 6, end: 10 },
  ],
}

test('clips match to beats in script order', () => {
  const p = matchClipsToBeats(project([1, 1]), episode)
  assert.deepEqual(p.clips.map((c) => c.sceneId), ['s1', 's2'])
})

test('cut markers report where each beat actually landed', () => {
  const p = matchClipsToBeats(project([1.5, 3]), episode)
  assert.deepEqual(cutMarkers(p, episode).map((m) => [m.sceneId, m.start, m.end]), [['s1', 0, 1.5], ['s2', 1.5, 4.5]])
})

test('the episode as cut keeps only beats with footage, re-timed, with the real runtime', () => {
  const p = matchClipsToBeats(project([1.5, 3]), episode)
  const { episode: cut, beatsCovered } = episodeAsCut(episode, p)
  assert.equal(beatsCovered, 2)
  assert.deepEqual(cut.scenes.map((s) => [s.id, s.start, s.end, s.index]), [['s1', 0, 1.5, 0], ['s2', 1.5, 4.5, 1]])
  assert.equal(cut.length, 5)
})
