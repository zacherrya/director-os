import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ease, FONT_COMBOS, TEXT_ANIMATIONS, TRANSITIONS, fontDescriptors, matchAnimation, matchFontCombo,
  textAnimation, textsFromScript, tokenize, transitionFrame, unitStarts, unitState,
} from '../src/lib/editor/presets.ts'

const peak = (fn, steps = 400) => Math.max(...Array.from({ length: steps + 1 }, (_, i) => fn(i / steps)))

/* ------------------------------------------------------------ house style --- */

test('every entrance lasts at least the house minimum — below ~0.25s a pop reads as a snap', () => {
  for (const a of TEXT_ANIMATIONS) {
    if (a.id === 'typewriter') continue // letters appear instantly by design; the stagger is the motion
    assert.ok(a.enter >= 0.32 && a.enter <= 0.45, `${a.id} enters in ${a.enter}s`)
  }
})

test('exits are short and quick, ~0.2s, and nothing loops', () => {
  for (const a of TEXT_ANIMATIONS) assert.ok(a.exit >= 0.18 && a.exit <= 0.24, `${a.id} exits in ${a.exit}s`)
})

test('letter staggers sit in the house 0.04–0.06s band', () => {
  for (const a of TEXT_ANIMATIONS.filter((x) => x.timing === 'stagger')) {
    assert.ok(a.stagger >= 0.04 && a.stagger <= 0.06, `${a.id} staggers ${a.stagger}s`)
  }
})

test('pop overshoots a few percent and settles on exactly 1', () => {
  const anim = textAnimation('pop')
  const scaleAt = (p) => unitState(anim, p * anim.enter, 3, 0, [0]).scale
  const top = peak(scaleAt)
  assert.ok(top > 1.02 && top < 1.09, `pop peaks at ${top}`)
  assert.ok(Math.abs(unitState(anim, anim.enter, 3, 0, [0]).scale - 1) < 1e-9)
})

test('backOut overshoots then lands on 1', () => {
  const f = ease.backOut(1.7)
  assert.ok(Math.abs(f(0)) < 1e-12)
  assert.ok(Math.abs(f(1) - 1) < 1e-12)
  assert.ok(peak(f) > 1.05)
})

/* ----------------------------------------------------------------- timing --- */

test('staggers compress rather than outlast a short caption', () => {
  const anim = textAnimation('cascade')
  const starts = unitStarts(anim, Array(40).fill(1), 1)
  assert.ok(starts[39] <= 0.5 + 1e-9, `last letter starts at ${starts[39]}`)
})

test('speech timing gives longer words longer, and keeps the last word in time to be read', () => {
  const anim = textAnimation('word-pop')
  const starts = unitStarts(anim, [1, 12, 1], 3)
  assert.equal(starts[0], 0)
  assert.ok(starts[2] - starts[1] > starts[1] - starts[0], 'the long word takes longer')
  assert.ok(starts[2] < 3 * 0.8)
})

test('karaoke lights exactly one word at a time, walking forward', () => {
  const anim = textAnimation('karaoke')
  const starts = unitStarts(anim, [3, 3, 3], 3)
  for (let t = 0.01; t < 2.3; t += 0.05) {
    const lit = [0, 1, 2].filter((i) => unitState(anim, t, 3, i, starts).highlight === 1)
    assert.equal(lit.length, 1, `at ${t.toFixed(2)} lit=${lit}`)
  }
})

test('a unit before its turn is hidden, and so is everything outside the caption', () => {
  const anim = textAnimation('word-pop')
  const starts = [0, 1]
  assert.equal(unitState(anim, 0.5, 2, 1, starts).visible, false)
  assert.equal(unitState(anim, -0.1, 2, 0, starts).visible, false)
  assert.equal(unitState(anim, 2, 2, 0, starts).visible, false)
})

test('text fades out before it ends', () => {
  const anim = textAnimation('rise')
  const late = unitState(anim, 2.98, 3, 0, [0])
  assert.ok(late.opacity < 0.2, `still at ${late.opacity}`)
})

test('the same moment always yields the same frame — seeking is safe', () => {
  for (const a of TEXT_ANIMATIONS) {
    const starts = unitStarts(a, [2, 3, 4], 2)
    assert.deepEqual(unitState(a, 0.61, 2, 1, starts), unitState(a, 0.61, 2, 1, starts))
  }
})

/* -------------------------------------------------------------- emphasis --- */

test('asterisks mark emphasis words and disappear from the text', () => {
  assert.deepEqual(tokenize('Stop wearing *black* to weddings'), [
    { text: 'Stop', emphasis: false }, { text: 'wearing', emphasis: false },
    { text: 'black', emphasis: true }, { text: 'to', emphasis: false }, { text: 'weddings', emphasis: false },
  ])
  assert.deepEqual(tokenize('*two words* here').map((t) => t.emphasis), [true, true, false])
})

/* ----------------------------------------------------------- transitions --- */

test('every transition starts on the outgoing shot and ends on the incoming one', () => {
  for (const t of TRANSITIONS) {
    const start = transitionFrame(t.id, 0)
    const end = transitionFrame(t.id, 1)
    const outShows = start.out.visible && start.out.alpha > 0.99
    const inHidden = !start.in.visible || start.in.alpha < 0.01 || Math.abs(start.in.dx) >= 1 || Math.abs(start.in.dy) >= 1
    assert.ok(outShows && inHidden, `${t.id} does not start on the outgoing shot`)
    assert.ok(end.in.visible && end.in.alpha > 0.99 && Math.abs(end.in.dx) < 1e-9 && Math.abs(end.in.dy) < 1e-9 && Math.abs(end.in.scale - 1) < 1e-9, `${t.id} does not land cleanly`)
    assert.ok(!end.overlay || end.overlay.alpha < 1e-9, `${t.id} leaves an overlay behind`)
  }
})

test('the flash peaks mid-transition', () => {
  assert.ok(transitionFrame('flash', 0.5).overlay.alpha > 0.99)
  assert.ok(transitionFrame('flash', 0.1).overlay.alpha < 0.5)
})

test('cut has no length; the rest do', () => {
  for (const t of TRANSITIONS) assert.equal(t.defaultDuration === 0, t.id === 'cut')
})

/* ------------------------------------------------------------------ fonts --- */

test('every look preloads its accent face too', () => {
  const ed = FONT_COMBOS.find((f) => f.id === 'editorial')
  assert.ok(fontDescriptors(ed).some((d) => d.includes('Fraunces') && d.startsWith('italic')))
})

/* ------------------------------------------------------------- the script --- */

test('free-text script fields map onto the nearest look', () => {
  assert.equal(matchAnimation('pop in'), 'pop')
  assert.equal(matchAnimation('typewriter'), 'typewriter')
  assert.equal(matchAnimation('word by word'), 'word-pop')
  assert.equal(matchAnimation(''), 'rise')
  assert.equal(matchFontCombo('Bold white caps'), 'bold-impact')
  assert.equal(matchFontCombo('handwritten'), 'handwritten')
  assert.equal(matchFontCombo('whatever'), 'clean-caption')
})

test('script on-screen text lands at each beat, clamped to the beat', () => {
  const episode = { scenes: [
    { id: 'a', start: 0, end: 2, onScreenText: { text: 'Hook line', font: 'bold', animation: 'pop', position: 'Center', duration: 5 } },
    { id: 'b', start: 2, end: 4, onScreenText: { text: '   ', font: '', animation: '', position: 'Top', duration: 1 } },
    { id: 'c', start: 4, end: 7, onScreenText: { text: 'Later', font: '', animation: '', position: 'Top', duration: 0 } },
  ] }
  const texts = textsFromScript(episode, () => 'x')
  assert.deepEqual(texts.map((t) => [t.sceneId, t.start, t.duration, t.position, t.animation, t.style]), [
    ['a', 0, 2, 'center', 'pop', 'bold-impact'],
    ['c', 4, 3, 'top', 'rise', 'clean-caption'],
  ])
})
