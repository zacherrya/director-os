// Renders Director OS's procedurally-synthesized SFX and music (the "Basic"
// SFX and every built-in MUSIC_LIBRARY track — none of which have real audio
// bytes on disk) into real WAV files, so a Premiere export can include them
// as actual clips rather than silence or a text note. Real, file-backed audio
// (Story Sound Pack SFX, user-uploaded music) doesn't go through here — it's
// already bytes on disk / in IndexedDB.

import { findSfx, findMusic, playTone, playSweep, type MusicPattern } from './audioEngine'

const SAMPLE_RATE = 44100

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

/** Minimal PCM16 WAV encoder — the Web Audio/Media APIs can decode audio but
 * have no built-in way to encode an AudioBuffer back out to a file. */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const numFrames = buffer.length
  const blockAlign = numChannels * 2
  const dataSize = numFrames * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const channels = Array.from({ length: numChannels }, (_, ch) => buffer.getChannelData(ch))
  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

/** Renders a synth "Basic" SFX (no `url`) to a WAV file. Returns undefined for
 * anything that isn't a synth def (real SOUND_PACK files are fetched directly
 * instead — see premiereExport.ts). */
export async function renderSfxToWav(idOrLabel: string): Promise<{ blob: Blob; duration: number } | undefined> {
  const def = findSfx(idOrLabel)
  if (!def?.play) return undefined
  const duration = def.naturalDuration ?? 1
  const renderLength = duration + 0.15 // tail buffer for release/decay past the perceptual duration
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(renderLength * SAMPLE_RATE), SAMPLE_RATE)
  def.play(offlineCtx, 0)
  const rendered = await offlineCtx.startRendering()
  return { blob: audioBufferToWav(rendered), duration }
}

function renderPattern(context: OfflineAudioContext, master: AudioNode, pattern: MusicPattern, duration: number) {
  if (pattern.kind === 'silence') return
  if (pattern.kind === 'loop') {
    const intervalSeconds = pattern.interval / 1000
    let t = 0
    let i = 0
    while (t < duration) {
      const n = pattern.notes[i % pattern.notes.length]
      playTone(context, n.freq, n.dur, n.type, n.gain, master, t)
      t += intervalSeconds
      i++
    }
    return
  }
  // bell-whoosh: bespoke two-step cycle (tone, then a sweep 0.7s later, then
  // repeat every 2.1s) — mirrors startForPattern's 'bell-whoosh' case exactly,
  // just expressed as absolute offsets instead of chained setTimeouts.
  let cycleStart = 0
  while (cycleStart < duration) {
    playTone(context, 1568, 0.6, 'triangle', 0.16, master, cycleStart)
    playSweep(context, 900, 300, 0.4, 0.1, master, cycleStart + 0.7)
    cycleStart += 2.1
  }
}

/** Renders a built-in music track to a WAV file spanning exactly `duration`
 * seconds. Returns undefined for "Music Cut (Silence)" — there's nothing
 * useful to bundle for an intentional silence track. */
export async function renderMusicToWav(idOrLabel: string, duration: number): Promise<Blob | undefined> {
  const def = findMusic(idOrLabel)
  if (!def || def.pattern.kind === 'silence' || duration <= 0) return undefined
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)
  const master = offlineCtx.createGain()
  master.gain.value = 0.5
  master.connect(offlineCtx.destination)
  renderPattern(offlineCtx, master, def.pattern, duration)
  const rendered = await offlineCtx.startRendering()
  return audioBufferToWav(rendered)
}
