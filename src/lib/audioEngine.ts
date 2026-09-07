// Sound engine mixing two sources: procedurally synthesized tones (Web Audio
// API, zero assets) for quick "Basic" sounds, and real licensed SFX from The
// Story Sound Pack (compressed mp3s in public/sfx/) for everything else.

import { SOUND_PACK } from '../data/soundPack'

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AudioCtx()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function noiseBuffer(context: BaseAudioContext, duration: number): AudioBuffer {
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * duration)), context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

// `when` defaults to `context.currentTime` (i.e. "now") for real-time playback,
// but every delay below is expressed as an absolute AudioParam/start() time
// rather than a `setTimeout` — which is what makes these functions safe to
// call against an OfflineAudioContext (see audioBounce.ts), whose clock only
// advances during rendering and ignores the JS event loop entirely.
// Exported (unlike playNoise) because audioBounce.ts needs them to render
// music patterns and the bell-whoosh track offline — see MusicPattern above.
export function playTone(
  context: BaseAudioContext,
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainPeak = 0.22,
  destination: AudioNode = context.destination,
  when: number = context.currentTime,
) {
  const osc = context.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.linearRampToValueAtTime(gainPeak, when + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
  osc.connect(gain).connect(destination)
  osc.start(when)
  osc.stop(when + duration + 0.05)
}

function playNoise(
  context: BaseAudioContext,
  duration: number,
  filterFreq = 2000,
  gainPeak = 0.25,
  filterType: BiquadFilterType = 'lowpass',
  destination: AudioNode = context.destination,
  when: number = context.currentTime,
) {
  const src = context.createBufferSource()
  src.buffer = noiseBuffer(context, duration)
  const filter = context.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = filterFreq
  const gain = context.createGain()
  gain.gain.setValueAtTime(gainPeak, when)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
  src.connect(filter).connect(gain).connect(destination)
  src.start(when)
}

export function playSweep(
  context: BaseAudioContext,
  startFreq: number,
  endFreq: number,
  duration: number,
  gainPeak = 0.2,
  destination: AudioNode = context.destination,
  when: number = context.currentTime,
) {
  const osc = context.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(startFreq, when)
  osc.frequency.exponentialRampToValueAtTime(endFreq, when + duration)
  const gain = context.createGain()
  gain.gain.setValueAtTime(gainPeak, when)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
  osc.connect(gain).connect(destination)
  osc.start(when)
  osc.stop(when + duration + 0.05)
}

// ---------------------------------------------------------------------------
// SFX — one-shot sounds
// ---------------------------------------------------------------------------

export interface SfxDef {
  id: string
  label: string
  category: string
  /** `when` is an absolute BaseAudioContext time (defaults to "now"). Every
   * multi-tone def below schedules its later notes as `when + offset` rather
   * than via `setTimeout`, which is what makes `play` safe to call against an
   * OfflineAudioContext for export bouncing (see audioBounce.ts). */
  play?: (context: BaseAudioContext, when?: number) => void
  url?: string
  /** Perceptual length of a synth (`play`-based) def — there's no file to probe a
   * real duration from, so audioBounce.ts needs this to know how long to render
   * and how long the exported clip should be when a scene doesn't specify one. */
  naturalDuration?: number
}

export const SFX_CATEGORIES = ['Basic', ...new Set(SOUND_PACK.map((s) => s.category))]

const BASIC_SFX: SfxDef[] = [
  { id: 'click', label: 'Click', category: 'Basic', naturalDuration: 0.06, play: (c, w) => playTone(c, 1046, 0.06, 'square', 0.18, c.destination, w) },
  { id: 'pop', label: 'Pop', category: 'Basic', naturalDuration: 0.14, play: (c, w) => playTone(c, 587, 0.14, 'sine', 0.28, c.destination, w) },
  { id: 'bell', label: 'Bell', category: 'Basic', naturalDuration: 0.9, play: (c, w) => playTone(c, 1568, 0.9, 'sine', 0.22, c.destination, w) },
  {
    id: 'bell-ding',
    label: 'Bell Ding',
    category: 'Basic',
    naturalDuration: 0.54,
    play: (c, w = c.currentTime) => {
      playTone(c, 1568, 0.5, 'triangle', 0.2, c.destination, w)
      playTone(c, 2093, 0.45, 'triangle', 0.16, c.destination, w + 0.09)
    },
  },
  {
    id: 'sparkle',
    label: 'Sparkle',
    category: 'Basic',
    naturalDuration: 0.4,
    play: (c, w = c.currentTime) => {
      ;[1800, 2200, 2600, 3100].forEach((f, i) => playTone(c, f, 0.22, 'sine', 0.12, c.destination, w + i * 0.055))
    },
  },
  { id: 'whoosh', label: 'Whoosh', category: 'Basic', naturalDuration: 0.4, play: (c, w) => playSweep(c, 1400, 220, 0.4, 0.18, c.destination, w) },
  {
    id: 'closet-opens',
    label: 'Closet opens',
    category: 'Basic',
    naturalDuration: 0.45,
    play: (c, w) => playNoise(c, 0.45, 450, 0.22, 'lowpass', c.destination, w),
  },
  {
    id: 'hanger-movement',
    label: 'Hanger movement',
    category: 'Basic',
    naturalDuration: 0.28,
    play: (c, w) => playNoise(c, 0.28, 3200, 0.14, 'highpass', c.destination, w),
  },
  {
    id: 'phone-tap',
    label: 'Phone tap',
    category: 'Basic',
    naturalDuration: 0.05,
    play: (c, w) => playTone(c, 1500, 0.05, 'square', 0.18, c.destination, w),
  },
  {
    id: 'card-swipe',
    label: 'Card swipe',
    category: 'Basic',
    naturalDuration: 0.22,
    play: (c, w) => playNoise(c, 0.22, 4200, 0.14, 'highpass', c.destination, w),
  },
  {
    id: 'notebook-open',
    label: 'Notebook Open',
    category: 'Basic',
    naturalDuration: 0.32,
    play: (c, w) => playNoise(c, 0.32, 1400, 0.16, 'bandpass', c.destination, w),
  },
  {
    id: 'marker-write',
    label: 'Marker Write',
    category: 'Basic',
    naturalDuration: 0.55,
    play: (c, w) => playNoise(c, 0.55, 2600, 0.09, 'highpass', c.destination, w),
  },
  {
    id: 'page-flip',
    label: 'Page Flip',
    category: 'Basic',
    naturalDuration: 0.2,
    play: (c, w) => playNoise(c, 0.2, 3600, 0.15, 'highpass', c.destination, w),
  },
  {
    id: 'pen-write',
    label: 'Pen Write',
    category: 'Basic',
    naturalDuration: 0.42,
    play: (c, w) => playNoise(c, 0.42, 3000, 0.08, 'highpass', c.destination, w),
  },
  {
    id: 'camera-shutter',
    label: 'Camera Shutter',
    category: 'Basic',
    naturalDuration: 0.09,
    play: (c, w = c.currentTime) => {
      playNoise(c, 0.05, 6000, 0.3, 'highpass', c.destination, w)
      playTone(c, 320, 0.05, 'square', 0.18, c.destination, w + 0.04)
    },
  },
  {
    id: 'notification',
    label: 'Notification',
    category: 'Basic',
    naturalDuration: 0.27,
    play: (c, w = c.currentTime) => {
      playTone(c, 1200, 0.15, 'sine', 0.18, c.destination, w)
      playTone(c, 1600, 0.15, 'sine', 0.18, c.destination, w + 0.12)
    },
  },
]

const SOUND_PACK_SFX: SfxDef[] = SOUND_PACK.map((item) => ({
  id: item.id,
  label: item.label,
  category: item.category,
  url: item.url,
}))

export const SFX_LIBRARY: SfxDef[] = [...BASIC_SFX, ...SOUND_PACK_SFX]

// Sound-pack labels aren't unique across categories (e.g. "Sub" exists under
// both Impacts and Whooshes), so the value actually stored on a scene / used
// for lookup is qualified by category. Basic sounds stay bare for backward
// compatibility with existing scene data.
export function sfxDisplayLabel(def: SfxDef): string {
  return def.category === 'Basic' ? def.label : `${def.category} · ${def.label}`
}

// ---------------------------------------------------------------------------
// Music — short looping beds, start() returns a stop() function
// ---------------------------------------------------------------------------

export interface Note {
  freq: number
  type: OscillatorType
  dur: number
  gain: number
}

function loopPattern(context: AudioContext, notes: Note[], interval: number, master: GainNode): () => void {
  let active = true
  let i = 0
  let timer: number | undefined
  function tick() {
    if (!active) return
    const n = notes[i % notes.length]
    playTone(context, n.freq, n.dur, n.type, n.gain, master)
    i++
    timer = window.setTimeout(tick, interval)
  }
  tick()
  return () => {
    active = false
    if (timer) window.clearTimeout(timer)
  }
}

/** Declarative description of each track's pattern — the single source of
 * truth `start()` (live, indefinite playback) and `audioBounce.ts` (offline,
 * fixed-duration rendering for export) both derive their behavior from, so
 * the two can never drift out of sync with each other. */
export type MusicPattern =
  | { kind: 'loop'; notes: Note[]; interval: number }
  | { kind: 'bell-whoosh' }
  | { kind: 'silence' }

export interface MusicDef {
  id: string
  label: string
  mood: string
  pattern: MusicPattern
  start: (context: AudioContext, master: GainNode) => () => void
}

function startForPattern(pattern: MusicPattern): (context: AudioContext, master: GainNode) => () => void {
  switch (pattern.kind) {
    case 'loop':
      return (c, m) => loopPattern(c, pattern.notes, pattern.interval, m)
    case 'bell-whoosh':
      return (c, m) => {
        let active = true
        let timer: number | undefined
        function tick() {
          if (!active) return
          playTone(c, 1568, 0.6, 'triangle', 0.16, m)
          timer = window.setTimeout(() => {
            if (!active) return
            playSweep(c, 900, 300, 0.4, 0.1, m)
            timer = window.setTimeout(tick, 1400)
          }, 700)
        }
        tick()
        return () => {
          active = false
          if (timer) window.clearTimeout(timer)
        }
      }
    case 'silence':
      return () => () => {}
  }
}

function musicDef(id: string, label: string, mood: string, pattern: MusicPattern): MusicDef {
  return { id, label, mood, pattern, start: startForPattern(pattern) }
}

export const MUSIC_LIBRARY: MusicDef[] = [
  musicDef('cinematic-beat', 'Cinematic Beat', 'Tense, driving', {
    kind: 'loop',
    notes: [
      { freq: 110, type: 'triangle', dur: 0.28, gain: 0.22 },
      { freq: 110, type: 'triangle', dur: 0.16, gain: 0.14 },
      { freq: 130.8, type: 'triangle', dur: 0.28, gain: 0.2 },
      { freq: 110, type: 'triangle', dur: 0.16, gain: 0.14 },
    ],
    interval: 360,
  }),
  musicDef('light-beat', 'Light Beat', 'Playful, quick', {
    kind: 'loop',
    notes: [
      { freq: 523, type: 'square', dur: 0.1, gain: 0.1 },
      { freq: 659, type: 'square', dur: 0.1, gain: 0.09 },
      { freq: 784, type: 'square', dur: 0.1, gain: 0.09 },
      { freq: 659, type: 'square', dur: 0.1, gain: 0.08 },
    ],
    interval: 220,
  }),
  musicDef('uplifting-rise', 'Uplifting Rise', 'Inspiring, ascending', {
    kind: 'loop',
    notes: [
      { freq: 261.6, type: 'sine', dur: 0.32, gain: 0.16 },
      { freq: 329.6, type: 'sine', dur: 0.32, gain: 0.17 },
      { freq: 392, type: 'sine', dur: 0.32, gain: 0.18 },
      { freq: 523.3, type: 'sine', dur: 0.4, gain: 0.2 },
    ],
    interval: 300,
  }),
  musicDef('bell-ding-music', 'Bell Ding', 'Playful, instructive', {
    kind: 'loop',
    notes: [
      { freq: 1568, type: 'triangle', dur: 0.35, gain: 0.14 },
      { freq: 2093, type: 'triangle', dur: 0.3, gain: 0.1 },
    ],
    interval: 900,
  }),
  musicDef('soft-beat', 'Soft Beat', 'Calm, gentle', {
    kind: 'loop',
    notes: [
      { freq: 196, type: 'sine', dur: 0.5, gain: 0.12 },
      { freq: 246.9, type: 'sine', dur: 0.5, gain: 0.1 },
    ],
    interval: 700,
  }),
  musicDef('bell-whoosh', 'Bell + Whoosh', 'Whimsical, anticipation', { kind: 'bell-whoosh' }),
  musicDef('underscore', 'Underscore', 'Neutral background', {
    kind: 'loop',
    notes: [
      { freq: 220, type: 'sine', dur: 0.9, gain: 0.09 },
      { freq: 220, type: 'sine', dur: 0.9, gain: 0.09 },
    ],
    interval: 900,
  }),
  musicDef('chill-lofi', 'Chill Lo-fi', 'Relaxed, warm', {
    kind: 'loop',
    notes: [
      { freq: 174.6, type: 'sine', dur: 0.6, gain: 0.13 },
      { freq: 220, type: 'sine', dur: 0.6, gain: 0.11 },
      { freq: 196, type: 'sine', dur: 0.6, gain: 0.12 },
    ],
    interval: 620,
  }),
  musicDef('dramatic-tension', 'Dramatic Tension', 'Low, ominous', {
    kind: 'loop',
    notes: [
      { freq: 82.4, type: 'sawtooth', dur: 0.7, gain: 0.14 },
      { freq: 87.3, type: 'sawtooth', dur: 0.7, gain: 0.15 },
    ],
    interval: 650,
  }),
  musicDef('music-cut-silence', 'Music Cut (Silence)', 'Intentional silence', { kind: 'silence' }),
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let currentMusicStop: (() => void) | null = null
let currentMusicMaster: GainNode | null = null
let currentMusicId: string | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

export function onMusicChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function playSfx(idOrLabel: string, options: { volume?: number; duration?: number } = {}) {
  const def = findSfx(idOrLabel)
  if (!def) return
  if (def.url) {
    const audio = new Audio(def.url)
    audio.volume = options.volume ?? 0.8
    audio.play().catch(() => {})
    if (options.duration !== undefined) {
      setTimeout(() => {
        audio.pause()
        audio.currentTime = 0
      }, options.duration * 1000)
    }
  } else {
    def.play?.(getCtx())
  }
}

export function findSfx(idOrLabel: string): SfxDef | undefined {
  return SFX_LIBRARY.find((s) => s.id === idOrLabel || s.label === idOrLabel || sfxDisplayLabel(s) === idOrLabel)
}

export function findMusic(idOrLabel: string): MusicDef | undefined {
  return MUSIC_LIBRARY.find((m) => m.id === idOrLabel || m.label === idOrLabel)
}

export function playMusic(idOrLabel: string, options: { duration?: number } = {}) {
  const def = findMusic(idOrLabel)
  if (!def) return
  stopMusic()
  const token = ++playToken
  const context = getCtx()
  const master = context.createGain()
  master.gain.value = 0.5
  master.connect(context.destination)
  currentMusicMaster = master
  currentMusicStop = def.start(context, master)
  currentMusicId = def.id
  notify()
  if (options.duration !== undefined) {
    setTimeout(() => {
      if (playToken === token) stopMusic()
    }, options.duration * 1000)
  }
}

// Custom tracks imported from Finder/Files — played back through a real
// HTMLAudioElement rather than the synth engine, but tracked through the
// same "one music track at a time" bookkeeping so play/stop/UI state stay
// consistent whether the source is a library bed or an uploaded file.
export function customMusicKey(url: string): string {
  return `custom:${url}`
}

let playToken = 0

export interface PlayCustomMusicOptions {
  /** Seconds into the source file to start playback from — the "which part of the track" selector. */
  trimStart?: number
  /** If set, playback auto-stops after this many seconds (used for per-scene playback capped to scene duration). */
  playDuration?: number
  /** Defaults to true when no playDuration is given (whole-video mode), false otherwise. */
  loop?: boolean
}

export function playCustomMusic(url: string, options: PlayCustomMusicOptions = {}) {
  stopMusic()
  const token = ++playToken
  const audio = new Audio(url)
  audio.loop = options.loop ?? options.playDuration === undefined
  audio.volume = 0.6
  const trimStart = options.trimStart ?? 0
  const start = () => {
    try {
      audio.currentTime = trimStart
    } catch {
      // metadata not ready yet — will already start near 0
    }
    audio.play().catch(() => {})
  }
  if (audio.readyState >= 1) start()
  else audio.addEventListener('loadedmetadata', start, { once: true })

  currentMusicStop = () => {
    audio.pause()
    audio.currentTime = 0
  }
  currentMusicId = customMusicKey(url)
  notify()

  if (options.playDuration !== undefined) {
    setTimeout(() => {
      if (playToken === token) stopMusic()
    }, options.playDuration * 1000)
  }
}

export function stopMusic() {
  playToken++
  currentMusicStop?.()
  currentMusicStop = null
  if (currentMusicMaster) {
    try {
      currentMusicMaster.disconnect()
    } catch {
      // already disconnected
    }
  }
  currentMusicMaster = null
  const wasPlaying = currentMusicId !== null
  currentMusicId = null
  if (wasPlaying) notify()
}

export function toggleMusic(idOrLabel: string) {
  if (currentMusicId === findMusic(idOrLabel)?.id) {
    stopMusic()
  } else {
    playMusic(idOrLabel)
  }
}

export function toggleCustomMusic(url: string) {
  if (currentMusicId === customMusicKey(url)) {
    stopMusic()
  } else {
    playCustomMusic(url)
  }
}

export function getPlayingMusicId(): string | null {
  return currentMusicId
}

export function isMusicPlaying(idOrLabel?: string): boolean {
  if (!currentMusicId) return false
  if (!idOrLabel) return true
  return findMusic(idOrLabel)?.id === currentMusicId
}
