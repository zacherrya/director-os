import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shadesOf, normalizeHex, contrastInk, hexToRgb, rgbToHsv } from '../src/lib/brandColor.ts'

const hue = (hex) => { const [r, g, b] = hexToRgb(hex); return rgbToHsv(r, g, b)[0] }
const value = (hex) => { const [r, g, b] = hexToRgb(hex); return rgbToHsv(r, g, b)[2] }

test('every shade keeps the brand hue', () => {
  const shades = shadesOf('#C8A86B', 6)
  const base = hue('#C8A86B')
  for (const s of shades) assert.ok(Math.abs(hue(s) - base) < 1.5, `${s} drifted off hue`)
})

test('shades are ordered light to dark and none collapses to black or white', () => {
  const shades = shadesOf('#4F8FC0', 6)
  const values = shades.map(value)
  for (let i = 1; i < values.length; i++) assert.ok(values[i] < values[i - 1], 'must descend')
  assert.ok(values.at(-1) > 0.25, 'the darkest shade must still read as a colour')
  assert.ok(values[0] < 0.98, 'the lightest shade must not be white')
})

test('every shade is visually distinct from its neighbour', () => {
  const shades = shadesOf('#B6598F', 8)
  assert.equal(new Set(shades).size, 8)
  const values = shades.map(value)
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i - 1] - values[i] > 0.04, `steps ${i - 1} and ${i} are too close to tell apart`)
  }
})

test('a grey brand colour stays grey rather than acquiring a hue', () => {
  for (const s of shadesOf('#8D908B', 5)) {
    const [r, g, b] = hexToRgb(s)
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 12, `${s} picked up a colour cast`)
  }
})

test('edge cases return something sane rather than throwing', () => {
  assert.deepEqual(shadesOf('#C8A86B', 0), [])
  assert.deepEqual(shadesOf('not a colour', 4), [])
  assert.deepEqual(shadesOf('#C8A86B', 1), ['#C8A86B'])
  assert.equal(shadesOf('#abc', 3).length, 3, 'short hex is accepted')
})

test('a monogram stays readable on any shade produced', () => {
  for (const s of shadesOf('#2A2A2D', 6)) {
    assert.ok(['#1C1C1E', '#FFFFFF'].includes(contrastInk(s)))
  }
  assert.equal(contrastInk(shadesOf('#2A2A2D', 6)[0]), '#1C1C1E', 'the palest shade takes dark ink')
})

test('normalizeHex is the single gate for user-typed colour', () => {
  assert.equal(normalizeHex(' c8a86b '), '#C8A86B')
  assert.equal(normalizeHex('#ABC'), '#AABBCC')
  assert.equal(normalizeHex('#12345'), null)
})
