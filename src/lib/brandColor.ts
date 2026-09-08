/**
 * Colour maths for brand identity colours. Pure functions, no React — the
 * picker and the table both need them.
 */

export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '')
  const short = /^[0-9a-fA-F]{3}$/.test(raw)
  const long = /^[0-9a-fA-F]{6}$/.test(raw)
  if (!short && !long) return null
  const full = short ? raw.split('').map((c) => c + c).join('') : raw
  return `#${full.toUpperCase()}`
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

/** h 0–360, s and v 0–1. */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6
    else if (max === gg) h = (bb - rr) / d + 2
    else h = (rr - gg) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const seg = Math.floor(h / 60) % 6
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg] as [number, number, number]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** Readable ink for a monogram sitting on this colour. */
export function contrastInk(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  // Rec. 709 luma — a mid green reads much lighter than a mid blue at the same
  // RGB average, and brand palettes are full of both.
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luma > 0.62 ? '#1C1C1E' : '#FFFFFF'
}

/**
 * A ladder of shades derived from one brand colour, for the Contact Nucleus
 * spheres: the nucleus takes the brand's own colour and everything orbiting it
 * takes a shade of the same hue, so a network reads at a glance as belonging to
 * that brand.
 *
 * Hue is held fixed and value is walked across a band that stops well short of
 * both black and white — a shade that reaches either end stops looking like the
 * brand and starts looking like a shadow. Saturation is lifted slightly at the
 * light end, because a pale tint of a muted brand colour otherwise washes out to
 * near-grey against an ivory ground.
 */
export function shadesOf(hex: string, count: number): string[] {
  const base = normalizeHex(hex)
  if (!base || count <= 0) return []
  const [r, g, b] = hexToRgb(base)
  const [h, s] = rgbToHsv(r, g, b)
  if (count === 1) return [base]

  const LIGHTEST = 0.92
  const DARKEST = 0.34
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1)
    const value = LIGHTEST - t * (LIGHTEST - DARKEST)
    // Pale steps need more saturation to stay recognisably the same colour;
    // dark steps need slightly less or they turn muddy.
    const sat = Math.min(1, s * (1.25 - 0.4 * (1 - t)))
    return rgbToHex(...hsvToRgb(h, s === 0 ? 0 : sat, value))
  })
}
