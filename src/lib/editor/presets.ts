/**
 * The looks: type pairings, text animations and transitions.
 *
 * Every animation here is a pure function of time, so the preview, the export
 * and the tests all agree on what frame 37 looks like, and a render can seek to
 * any moment without replaying the moments before it.
 *
 * The motion values are Zack's house style rather than library defaults:
 * entrances of 0.32–0.45s (below ~0.25s a pop reads as a snap), `back.out`
 * arrivals that overshoot a few percent and settle, `power2.in` exits of about
 * 0.2s, letters staggered 0.04–0.06s apart, and a two-or-three-frame blur on
 * arrival because it buys a lot of "alive" for nothing. Nothing loops — a render
 * has to be able to land on any frame and get the same answer.
 */

import type { Episode } from '../types.ts'
import {
  MIN_TEXT_SECONDS,
  type EditText,
  type FontComboId,
  type TextAnimationId,
  type TextPosition,
  type TransitionId,
} from './model.ts'

/* ---------------------------------------------------------------- easing --- */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export const ease = {
  linear: (t: number) => t,
  power2In: (t: number) => t * t,
  power2Out: (t: number) => 1 - (1 - t) * (1 - t),
  power3Out: (t: number) => 1 - (1 - t) ** 3,
  power3InOut: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  /** Overshoots and settles. `s` 1.6–2.4 is the house range. */
  backOut:
    (s = 1.7) =>
    (t: number) => {
      const c = s + 1
      return 1 + c * (t - 1) ** 3 + s * (t - 1) ** 2
    },
}

/* ------------------------------------------------------------ type looks --- */

export interface FontCombo {
  id: FontComboId
  label: string
  description: string
  family: string
  weight: number
  italic?: boolean
  /** Font size as a share of frame *width*, so 9:16 and 1:1 read the same size. */
  size: number
  uppercase: boolean
  /** Letter spacing, em. */
  tracking: number
  lineHeight: number
  fill: string
  stroke?: { color: string; width: number }
  shadow?: { color: string; blur: number; dy: number }
  /** A box behind the whole line — the native-app "label" look. Lengths in em. */
  box?: { color: string; padX: number; padY: number; radius: number }
  /** How *emphasised* words and the active karaoke word are set apart. */
  accent: { fill?: string; family?: string; weight?: number; italic?: boolean; box?: string }
}

const SOFT_SHADOW = { color: 'rgba(0,0,0,0.55)', blur: 0.2, dy: 0.05 }

export const FONT_COMBOS: FontCombo[] = [
  {
    id: 'clean-caption',
    label: 'Clean caption',
    description: 'Heavy sans with a soft shadow — the default caption most viewers expect.',
    family: 'Inter, system-ui, sans-serif',
    weight: 800,
    size: 0.062,
    uppercase: false,
    tracking: -0.01,
    lineHeight: 1.12,
    fill: '#FFFFFF',
    stroke: { color: 'rgba(0,0,0,0.85)', width: 0.07 },
    shadow: SOFT_SHADOW,
    accent: { fill: '#FFD43B' },
  },
  {
    id: 'bold-impact',
    label: 'Bold impact',
    description: 'Uppercase black-weight with a hard outline and a yellow key word.',
    family: 'Montserrat, Inter, sans-serif',
    weight: 900,
    size: 0.068,
    uppercase: true,
    tracking: 0,
    lineHeight: 1.05,
    fill: '#FFFFFF',
    stroke: { color: '#000000', width: 0.16 },
    accent: { fill: '#FFE53B' },
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Clean sans, with emphasis words switching into italic serif.',
    family: 'Inter, system-ui, sans-serif',
    weight: 600,
    size: 0.058,
    uppercase: false,
    tracking: -0.015,
    lineHeight: 1.15,
    fill: '#FFFFFF',
    shadow: SOFT_SHADOW,
    accent: { family: 'Fraunces, Georgia, serif', weight: 400, italic: true },
  },
  {
    id: 'poster',
    label: 'Condensed poster',
    description: 'Tall condensed caps for one big statement. Use sparingly.',
    family: 'Anton, Impact, sans-serif',
    weight: 400,
    size: 0.11,
    uppercase: true,
    tracking: 0.01,
    lineHeight: 0.98,
    fill: '#FFFFFF',
    shadow: SOFT_SHADOW,
    accent: { fill: '#D3A75C' },
  },
  {
    id: 'label-pill',
    label: 'Label pill',
    description: 'Dark text on a white rounded box, like the platforms’ own text tool.',
    family: 'Inter, system-ui, sans-serif',
    weight: 700,
    size: 0.05,
    uppercase: false,
    tracking: -0.01,
    lineHeight: 1.2,
    fill: '#111111',
    box: { color: '#FFFFFF', padX: 0.45, padY: 0.22, radius: 0.35 },
    accent: { fill: '#A97B2F' },
  },
  {
    id: 'handwritten',
    label: 'Handwritten note',
    description: 'A marker-pen note — personal asides and reactions.',
    family: 'Caveat, cursive',
    weight: 700,
    size: 0.085,
    uppercase: false,
    tracking: 0,
    lineHeight: 1.05,
    fill: '#FFFFFF',
    shadow: SOFT_SHADOW,
    accent: { fill: '#FFD43B' },
  },
  {
    id: 'mono-label',
    label: 'Mono label',
    description: 'Small tracked-out caps on a smoked box — chapter titles and callouts.',
    family: '"IBM Plex Mono", ui-monospace, monospace',
    weight: 500,
    size: 0.036,
    uppercase: true,
    tracking: 0.12,
    lineHeight: 1.3,
    fill: '#FFFFFF',
    box: { color: 'rgba(0,0,0,0.55)', padX: 0.6, padY: 0.35, radius: 0.15 },
    accent: { fill: '#D3A75C' },
  },
  {
    id: 'classic-serif',
    label: 'Classic serif',
    description: 'A fashion-magazine serif, with emphasis in italic.',
    family: '"Playfair Display", Georgia, serif',
    weight: 600,
    size: 0.066,
    uppercase: false,
    tracking: -0.01,
    lineHeight: 1.1,
    fill: '#FFFFFF',
    shadow: SOFT_SHADOW,
    accent: { italic: true, fill: '#F3E3C3' },
  },
]

/** The animation each look is usually paired with — a starting point, changeable after. */
export const DEFAULT_ANIMATION: Record<FontComboId, TextAnimationId> = {
  'clean-caption': 'word-pop',
  'bold-impact': 'word-pop',
  editorial: 'blur-in',
  poster: 'punch',
  'label-pill': 'pop',
  handwritten: 'rise',
  'mono-label': 'typewriter',
  'classic-serif': 'blur-in',
}

export const fontCombo = (id: FontComboId): FontCombo => FONT_COMBOS.find((f) => f.id === id) ?? FONT_COMBOS[0]

/**
 * The extra faces the looks need, beyond what the app shell already loads.
 * Fetched only when the editor opens.
 */
export const EDITOR_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800;900' +
  '&family=Montserrat:wght@900&family=Anton&family=Caveat:wght@700' +
  '&family=Playfair+Display:ital,wght@0,600;1,600&family=Fraunces:ital,wght@1,400' +
  '&family=IBM+Plex+Mono:wght@500&display=swap'

/** CSS font shorthands to preload, so no frame is ever drawn in a fallback face. */
export function fontDescriptors(combo: FontCombo): string[] {
  const main = `${combo.italic ? 'italic ' : ''}${combo.weight} 64px ${combo.family}`
  const a = combo.accent
  const accent = `${a.italic ? 'italic ' : ''}${a.weight ?? combo.weight} 64px ${a.family ?? combo.family}`
  return main === accent ? [main] : [main, accent]
}

/* ------------------------------------------------------- text animations --- */

export interface TextAnimation {
  id: TextAnimationId
  label: string
  description: string
  /** What moves independently. */
  unit: 'line' | 'word' | 'letter'
  /**
   * `together`: every unit at once. `stagger`: a fixed gap between units.
   * `speech`: spread across the caption like spoken words, longer words taking
   * longer to say — there is no transcript to time against, so this is the
   * honest approximation.
   */
  timing: 'together' | 'stagger' | 'speech'
  /** Seconds between units, for `stagger`. */
  stagger: number
  /** Seconds each unit takes to arrive. */
  enter: number
  /** Seconds for the whole text to leave. */
  exit: number
}

export const TEXT_ANIMATIONS: TextAnimation[] = [
  { id: 'rise', label: 'Rise', description: 'Slides up into place and settles.', unit: 'line', timing: 'together', stagger: 0, enter: 0.38, exit: 0.2 },
  { id: 'pop', label: 'Pop', description: 'Springs in from small, overshoots, settles.', unit: 'line', timing: 'together', stagger: 0, enter: 0.36, exit: 0.2 },
  { id: 'word-pop', label: 'Word by word', description: 'Each word pops in as it would be said — the classic caption.', unit: 'word', timing: 'speech', stagger: 0, enter: 0.32, exit: 0.2 },
  { id: 'karaoke', label: 'Highlight', description: 'The line is on screen; the spoken word lights up.', unit: 'word', timing: 'speech', stagger: 0, enter: 0.38, exit: 0.2 },
  { id: 'typewriter', label: 'Typewriter', description: 'Letters type on with a caret.', unit: 'letter', timing: 'stagger', stagger: 0.045, enter: 0.001, exit: 0.2 },
  { id: 'blur-in', label: 'Soft focus', description: 'Pulls into focus from a blur.', unit: 'line', timing: 'together', stagger: 0, enter: 0.45, exit: 0.22 },
  { id: 'punch', label: 'Impact', description: 'Slams down from large. Best on one or two words.', unit: 'line', timing: 'together', stagger: 0, enter: 0.34, exit: 0.2 },
  { id: 'cascade', label: 'Cascade', description: 'Letters drop in one after another.', unit: 'letter', timing: 'stagger', stagger: 0.05, enter: 0.4, exit: 0.2 },
  { id: 'wipe', label: 'Wipe reveal', description: 'Revealed left to right behind a moving edge.', unit: 'line', timing: 'together', stagger: 0, enter: 0.42, exit: 0.2 },
]

export const textAnimation = (id: TextAnimationId): TextAnimation =>
  TEXT_ANIMATIONS.find((a) => a.id === id) ?? TEXT_ANIMATIONS[0]

/** Share of a caption's time the words are spread across; the rest lets the last word land and be read. */
const SPEECH_SPAN = 0.8
/** A stagger may use at most this share of the caption, however many letters. */
const STAGGER_SPAN = 0.5

/**
 * When each unit starts arriving, in seconds after the text starts.
 * `weights` are per-unit lengths for speech timing (characters, usually).
 */
export function unitStarts(anim: TextAnimation, weights: number[], duration: number): number[] {
  const n = weights.length
  if (n === 0) return []
  if (anim.timing === 'together' || n === 1) return weights.map(() => 0)
  if (anim.timing === 'stagger') {
    const gap = Math.min(anim.stagger, (duration * STAGGER_SPAN) / (n - 1))
    return weights.map((_, i) => i * gap)
  }
  const w = weights.map((x) => Math.max(1, x) + 1)
  const total = w.reduce((a, b) => a + b, 0)
  const starts: number[] = []
  let acc = 0
  for (const x of w) {
    starts.push((acc / total) * duration * SPEECH_SPAN)
    acc += x
  }
  return starts
}

export interface UnitState {
  visible: boolean
  opacity: number
  /** Offsets, in em of the text's own size. */
  dx: number
  dy: number
  scale: number
  /** Blur radius, em. */
  blur: number
  /** Share revealed left to right; 1 is fully shown. */
  reveal: number
  /** How strongly the accent treatment applies, 0–1. */
  highlight: number
}

const SHOWN: UnitState = { visible: true, opacity: 1, dx: 0, dy: 0, scale: 1, blur: 0, reveal: 1, highlight: 0 }
const HIDDEN: UnitState = { ...SHOWN, visible: false, opacity: 0 }

function arrive(id: TextAnimationId, p: number): Partial<UnitState> {
  switch (id) {
    case 'rise':
    case 'karaoke':
      return { opacity: ease.power2Out(clamp01(p / 0.6)), dy: 0.45 * (1 - ease.backOut(1.7)(p)) }
    case 'pop':
      return {
        opacity: clamp01(p / 0.35),
        scale: 0.6 + 0.4 * ease.backOut(2)(p),
        blur: 0.12 * (1 - clamp01(p / 0.25)),
      }
    case 'word-pop':
      return {
        opacity: clamp01(p / 0.3),
        scale: 0.7 + 0.3 * ease.backOut(2.2)(p),
        blur: 0.1 * (1 - clamp01(p / 0.25)),
      }
    case 'typewriter':
      return {}
    case 'blur-in':
      return { opacity: ease.power3Out(p), blur: 0.25 * (1 - ease.power3Out(p)), scale: 1.04 - 0.04 * ease.power3Out(p) }
    case 'punch':
      return { opacity: clamp01(p / 0.2), scale: 1.4 - 0.4 * ease.backOut(1.6)(p), blur: 0.08 * (1 - clamp01(p / 0.3)) }
    case 'cascade':
      return { opacity: ease.power2Out(p), dy: -0.4 * (1 - ease.backOut(1.8)(p)) }
    case 'wipe':
      return { reveal: ease.power3InOut(p) }
  }
}

/**
 * The state of one unit at `t` seconds into a text lasting `duration`.
 * Pure: the same inputs give the same frame, which is what makes seeking safe.
 */
export function unitState(
  anim: TextAnimation,
  t: number,
  duration: number,
  index: number,
  starts: number[],
): UnitState {
  if (t < 0 || t >= duration) return HIDDEN
  const begin = starts[index] ?? 0

  let state: UnitState
  if (anim.id === 'karaoke') {
    // The whole line arrives together; the highlight walks the words.
    const p = clamp01(t / anim.enter)
    const next = starts[index + 1] ?? duration * SPEECH_SPAN + anim.enter
    const lit = t >= begin && t < next
    state = { ...SHOWN, ...arrive('karaoke', p), highlight: lit ? 1 : 0 }
  } else {
    const local = t - begin
    if (local < 0) return HIDDEN
    state = { ...SHOWN, ...arrive(anim.id, clamp01(local / anim.enter)) }
  }

  // Leave before the next thing arrives — only if there is time to arrive and leave.
  if (duration > anim.enter + anim.exit + 0.1) {
    const exitStart = duration - anim.exit
    if (t > exitStart) {
      const e = ease.power2In(clamp01((t - exitStart) / anim.exit))
      state = { ...state, opacity: state.opacity * (1 - e), dy: state.dy + 0.12 * e }
    }
  }
  return state
}

/* -------------------------------------------------------------- emphasis --- */

export interface Token {
  text: string
  emphasis: boolean
}

/** Splits text into words, noting which were wrapped in *asterisks*. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const re = /\*([^*]+)\*|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) {
      for (const word of m[1].trim().split(/\s+/)) if (word) tokens.push({ text: word, emphasis: true })
    } else {
      tokens.push({ text: m[2], emphasis: false })
    }
  }
  return tokens
}

/* ----------------------------------------------------------- transitions --- */

export interface LayerFx {
  visible: boolean
  alpha: number
  scale: number
  /** Offsets as a share of frame width / height. */
  dx: number
  dy: number
  /** Blur radius as a share of frame width. */
  blur: number
  /** Horizontal motion-blur length as a share of frame width. */
  motionBlur: number
}

export interface TransitionFrame {
  out: LayerFx
  in: LayerFx
  /** A colour laid over everything — a flash, or a dip. */
  overlay: { color: string; alpha: number } | null
}

export interface TransitionPreset {
  id: TransitionId
  label: string
  description: string
  /** Seconds. Zero means an instant cut. */
  defaultDuration: number
}

export const TRANSITIONS: TransitionPreset[] = [
  { id: 'cut', label: 'Cut', description: 'Straight cut. The default for a reason.', defaultDuration: 0 },
  { id: 'dissolve', label: 'Dissolve', description: 'Cross-fade between the two shots.', defaultDuration: 0.4 },
  { id: 'soft-blur', label: 'Soft blur', description: 'Dissolve through a brief blur.', defaultDuration: 0.45 },
  { id: 'dip-black', label: 'Dip to black', description: 'Fade down and back up — a change of chapter.', defaultDuration: 0.5 },
  { id: 'flash', label: 'Flash', description: 'A white flash on the cut. One per video, not one per cut.', defaultDuration: 0.24 },
  { id: 'zoom-punch', label: 'Zoom punch', description: 'Punches into the outgoing shot and lands on the next.', defaultDuration: 0.3 },
  { id: 'whip', label: 'Whip pan', description: 'Both shots whip sideways with motion blur.', defaultDuration: 0.28 },
  { id: 'slide-up', label: 'Push up', description: 'The next shot pushes the last one up and out.', defaultDuration: 0.4 },
]

export const transitionPreset = (id: TransitionId): TransitionPreset =>
  TRANSITIONS.find((t) => t.id === id) ?? TRANSITIONS[0]

const LAYER: LayerFx = { visible: true, alpha: 1, scale: 1, dx: 0, dy: 0, blur: 0, motionBlur: 0 }
const GONE: LayerFx = { ...LAYER, visible: false, alpha: 0 }

/** How both shots look `p` (0–1) of the way through a transition. `in` draws over `out`. */
export function transitionFrame(id: TransitionId, progress: number): TransitionFrame {
  const p = clamp01(progress)
  const half = p < 0.5
  const tri = 1 - Math.abs(2 * p - 1) // 0 → 1 → 0
  switch (id) {
    case 'cut':
      return { out: half ? LAYER : GONE, in: half ? GONE : LAYER, overlay: null }
    case 'dissolve':
      return { out: LAYER, in: { ...LAYER, alpha: ease.power2Out(p) }, overlay: null }
    case 'soft-blur': {
      const blur = 0.018 * tri
      return { out: { ...LAYER, blur }, in: { ...LAYER, alpha: p, blur }, overlay: null }
    }
    case 'dip-black':
      return {
        out: half ? LAYER : GONE,
        in: half ? GONE : LAYER,
        overlay: { color: '#000000', alpha: ease.power2Out(tri) },
      }
    case 'flash':
      return {
        out: half ? LAYER : GONE,
        in: half ? GONE : LAYER,
        overlay: { color: '#FFFFFF', alpha: tri ** 1.5 },
      }
    case 'zoom-punch': {
      if (half) {
        const e = ease.power2In(p * 2)
        return { out: { ...LAYER, scale: 1 + 0.35 * e, blur: 0.022 * e }, in: GONE, overlay: null }
      }
      const e = ease.power3Out((p - 0.5) * 2)
      return { out: GONE, in: { ...LAYER, scale: 1.35 - 0.35 * e, blur: 0.022 * (1 - e) }, overlay: null }
    }
    case 'whip': {
      const e = ease.power3InOut(p)
      const blur = 0.07 * Math.sin(Math.PI * p)
      return {
        out: { ...LAYER, dx: -e, motionBlur: blur },
        in: { ...LAYER, dx: 1 - e, motionBlur: blur },
        overlay: null,
      }
    }
    case 'slide-up': {
      const e = ease.power3InOut(p)
      return { out: { ...LAYER, dy: -e }, in: { ...LAYER, dy: 1 - e }, overlay: null }
    }
  }
}

/* ------------------------------------------------------- from the script --- */

/**
 * The script's on-screen text fields are free text ("bold white", "pop in"),
 * written before any of these looks existed. Map them onto the nearest look,
 * falling back to the plain default rather than guessing wildly.
 */
const ANIMATION_WORDS: [TextAnimationId, RegExp][] = [
  ['typewriter', /type|typing|typewriter/i],
  ['karaoke', /karaoke|highlight/i],
  ['word-pop', /word/i],
  ['punch', /punch|slam|impact/i],
  ['blur-in', /blur|focus/i],
  ['cascade', /cascade|drop|letter/i],
  ['wipe', /wipe|reveal|mask/i],
  ['pop', /pop|bounce|spring|scale/i],
  ['rise', /rise|slide|up|fade/i],
]

const FONT_WORDS: [FontComboId, RegExp][] = [
  ['handwritten', /hand|script|marker|caveat/i],
  ['mono-label', /mono|typewriter|code/i],
  ['classic-serif', /serif|playfair|elegant|magazine/i],
  ['editorial', /editorial|fraunces|italic/i],
  ['poster', /poster|condensed|anton|huge/i],
  ['label-pill', /pill|box|label|tag/i],
  ['bold-impact', /impact|bold|caps|uppercase|montserrat|hormozi/i],
]

export function matchAnimation(free: string): TextAnimationId {
  return ANIMATION_WORDS.find(([, re]) => re.test(free))?.[0] ?? 'rise'
}

export function matchFontCombo(free: string): FontComboId {
  return FONT_WORDS.find(([, re]) => re.test(free))?.[0] ?? 'clean-caption'
}

const POSITION: Record<string, TextPosition> = { Top: 'top', Center: 'center', Bottom: 'bottom' }

/**
 * The on-screen text already written into the script, laid onto the edit at
 * each beat's planned time. The script is where these lines were thought about;
 * retyping them in the editor would be how they drift apart.
 */
export function textsFromScript(
  episode: Pick<Episode, 'scenes'>,
  id: () => string = () => crypto.randomUUID(),
): EditText[] {
  return episode.scenes
    .filter((s) => s.onScreenText?.text?.trim())
    .map((s) => {
      const beat = Math.max(MIN_TEXT_SECONDS, s.end - s.start)
      const asked = s.onScreenText.duration > 0 ? s.onScreenText.duration : beat
      return {
        id: id(),
        text: s.onScreenText.text.trim(),
        start: Math.max(0, s.start),
        duration: Math.max(MIN_TEXT_SECONDS, Math.min(asked, beat)),
        style: matchFontCombo(s.onScreenText.font ?? ''),
        animation: matchAnimation(s.onScreenText.animation ?? ''),
        position: POSITION[s.onScreenText.position] ?? 'bottom',
        sceneId: s.id,
      }
    })
}
