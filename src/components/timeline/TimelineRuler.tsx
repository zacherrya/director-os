import { useEffect, useRef, useState } from 'react'
import type { Episode, Scene } from '../../lib/types'
import { PURPOSE_COLOR } from '../../lib/types'
import { useAppStore } from '../../store/appStore'
import { Icon, Plus } from '../Icon'
import { findMusic, playCustomMusic, playMusic, playSfx, stopMusic } from '../../lib/audioEngine'

const RULER_HEIGHT = 24
const PACING_ROW_HEIGHT = 34
const RETENTION_ROW_HEIGHT = 52
const MUSIC_LANE_HEIGHT = 26
const SFX_ROW_HEIGHT = 22
const MIN_SFX_BLOCK_SECONDS = 0.3
const MIN_MUSIC_BLOCK_SECONDS = 0.5
const MUSIC_SCOPE_STORAGE_KEY = 'director-os-music-scope-mode'
const SHOW_PACING_STORAGE_KEY = 'director-os-show-pacing'
const SHOW_RETENTION_STORAGE_KEY = 'director-os-show-retention'

function loadMusicScopeMode(): MusicScopeMode {
  if (typeof window === 'undefined') return 'by-scene'
  return window.localStorage.getItem(MUSIC_SCOPE_STORAGE_KEY) === 'entire' ? 'entire' : 'by-scene'
}

function loadShowPacing(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(SHOW_PACING_STORAGE_KEY) !== 'off'
}

function loadShowRetention(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(SHOW_RETENTION_STORAGE_KEY) !== 'off'
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Until a creator drags a point, show a mild built-in decline (100% -> 70%)
// rather than a flat or empty line, so the graph reads as a real curve from
// the start instead of looking broken.
function defaultRetentionTarget(sceneIndex: number, sceneCount: number) {
  return 100 - ((sceneIndex + 1) / sceneCount) * 30
}

interface SfxBlock {
  cueId: string
  sceneId: string
  sceneStart: number
  sceneDuration: number
  offset: number
  blockDuration: number
  name: string
  absStart: number
  absEnd: number
  color: string
}

function computeSfxBlocks(scenes: Scene[]): SfxBlock[] {
  const blocks: SfxBlock[] = []
  for (const scene of scenes) {
    const sceneDuration = scene.end - scene.start
    const color = PURPOSE_COLOR[scene.purpose] ?? '#d3a75c'
    for (const cue of scene.audio.sfx) {
      const blockDuration = Math.max(
        MIN_SFX_BLOCK_SECONDS,
        Math.min(cue.duration ?? MIN_SFX_BLOCK_SECONDS, sceneDuration - cue.offset),
      )
      blocks.push({
        cueId: cue.id,
        sceneId: scene.id,
        sceneStart: scene.start,
        sceneDuration,
        offset: cue.offset,
        blockDuration,
        name: cue.name,
        absStart: scene.start + cue.offset,
        absEnd: scene.start + cue.offset + blockDuration,
        color,
      })
    }
  }
  return blocks
}

function packSfxLanes(blocks: SfxBlock[]): Map<string, number> {
  const laneEnds: number[] = []
  const laneOf = new Map<string, number>()
  const sorted = [...blocks].sort((a, b) => a.absStart - b.absStart)
  for (const b of sorted) {
    let lane = laneEnds.findIndex((end) => end <= b.absStart + 0.001)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(b.absEnd)
    } else {
      laneEnds[lane] = b.absEnd
    }
    laneOf.set(b.cueId, lane)
  }
  return laneOf
}

type MusicScopeMode = 'by-scene' | 'entire'

interface MusicBlock {
  sceneId: string
  sceneDuration: number
  offset: number
  blockDuration: number
  name: string
  musicFileUrl?: string
  musicTrimStart: number
  absStart: number
  absEnd: number
  color: string
}

function computeMusicBlocks(scenes: Scene[], scopeMode: MusicScopeMode, length: number): MusicBlock[] {
  const blocks: MusicBlock[] = []
  for (const scene of scenes) {
    if (!scene.audio.music) continue
    const sceneDuration = scene.end - scene.start
    const color = PURPOSE_COLOR[scene.purpose] ?? '#d3a75c'
    let offset: number
    let blockDuration: number
    if (scopeMode === 'entire') {
      const rawOffset = scene.audio.musicOffset ?? 0
      const absStartRaw = scene.start + rawOffset
      const clampedAbsStart = Math.max(0, Math.min(length - MIN_MUSIC_BLOCK_SECONDS, absStartRaw))
      offset = clampedAbsStart - scene.start
      // When no explicit duration has been set yet, default to the scene's own
      // duration rather than "sceneDuration - offset" — once the block has been
      // moved outside its owning scene that expression can go negative.
      const rawDuration = scene.audio.musicDuration ?? sceneDuration
      blockDuration = Math.max(MIN_MUSIC_BLOCK_SECONDS, Math.min(rawDuration, length - clampedAbsStart))
    } else {
      offset = Math.max(0, Math.min(scene.audio.musicOffset ?? 0, sceneDuration - MIN_MUSIC_BLOCK_SECONDS))
      blockDuration = Math.max(
        MIN_MUSIC_BLOCK_SECONDS,
        Math.min(scene.audio.musicDuration ?? sceneDuration - offset, sceneDuration - offset),
      )
    }
    const absStart = scene.start + offset
    blocks.push({
      sceneId: scene.id,
      sceneDuration,
      offset,
      blockDuration,
      name: scene.audio.music,
      musicFileUrl: scene.audio.musicFileUrl,
      musicTrimStart: scene.audio.musicTrimStart ?? 0,
      absStart,
      absEnd: absStart + blockDuration,
      color,
    })
  }
  return blocks
}

export function TimelineRuler({
  episode,
  selectedSceneId,
  onSelectScene,
  onAddScene,
  trackHeight = 64,
  playing,
  onPlayingChange,
  playhead,
  onPlayheadChange,
}: {
  episode: Episode
  selectedSceneId: string | null
  onSelectScene: (sceneId: string) => void
  onAddScene: () => void
  trackHeight?: number
  playing: boolean
  onPlayingChange: (v: boolean) => void
  playhead: number
  onPlayheadChange: (v: number) => void
}) {
  const updateSceneDuration = useAppStore((s) => s.updateSceneDuration)
  const updateScene = useAppStore((s) => s.updateScene)
  const setPlaying = onPlayingChange
  const setPlayhead = onPlayheadChange
  const [scrubbing, setScrubbing] = useState(false)
  const [resizing, setResizing] = useState<string | null>(null)
  const [interactingSfx, setInteractingSfx] = useState<string | null>(null)
  const [selectedSfxCueId, setSelectedSfxCueId] = useState<string | null>(null)
  const [interactingMusic, setInteractingMusic] = useState<string | null>(null)
  const [selectedMusicSceneId, setSelectedMusicSceneId] = useState<string | null>(null)
  const [musicScopeMode, setMusicScopeMode] = useState<MusicScopeMode>(loadMusicScopeMode)
  const [showPacing, setShowPacing] = useState(loadShowPacing)
  const [showRetention, setShowRetention] = useState(loadShowRetention)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  const lastPlayedSceneIdRef = useRef<string | null>(null)
  const activeMusicBlockKeyRef = useRef<string | null>(null)
  const pendingSfxRef = useRef<number[]>([])
  const episodeRef = useRef(episode)
  episodeRef.current = episode
  const selectedSceneIdRef = useRef(selectedSceneId)
  selectedSceneIdRef.current = selectedSceneId
  const musicScopeModeRef = useRef(musicScopeMode)
  musicScopeModeRef.current = musicScopeMode
  const resizeStateRef = useRef<{ sceneId: string; startClientX: number; startDuration: number; pxPerSec: number } | null>(
    null,
  )
  const sfxDragStateRef = useRef<{
    cueId: string
    sceneId: string
    mode: 'move' | 'resize-left' | 'resize-right'
    startClientX: number
    startOffset: number
    startDuration: number
    pxPerSec: number
  } | null>(null)
  const musicDragStateRef = useRef<{
    sceneId: string
    mode: 'move' | 'resize-left' | 'resize-right'
    startClientX: number
    startOffset: number
    startDuration: number
    pxPerSec: number
  } | null>(null)
  const [interactingRetentionSceneId, setInteractingRetentionSceneId] = useState<string | null>(null)
  const retentionDragStateRef = useRef<{ sceneId: string; rowTop: number; rowHeight: number } | null>(null)

  const length = episode.length
  const musicBlocks = computeMusicBlocks(episode.scenes, musicScopeMode, length)
  const musicBlocksRef = useRef(musicBlocks)
  musicBlocksRef.current = musicBlocks

  useEffect(() => () => {
    stopMusic()
    clearPendingSfx()
  }, [])

  function clearPendingSfx() {
    pendingSfxRef.current.forEach((t) => window.clearTimeout(t))
    pendingSfxRef.current = []
  }

  // SFX are one-shot cues — schedule them relative to scene entry, same as before.
  function triggerSceneSfx(scene: Scene, elapsedIntoScene: number) {
    clearPendingSfx()
    scene.audio.sfx.forEach((cue) => {
      const delay = cue.offset - elapsedIntoScene
      if (delay < 0) return
      const timeoutId = window.setTimeout(() => playSfx(cue.name, { duration: cue.duration }), delay * 1000)
      pendingSfxRef.current.push(timeoutId)
    })
  }

  // Music is checked every tick against the absolute [absStart, absEnd) span of
  // each block, rather than relying on a single scheduled setTimeout fired on
  // scene-entry. This is what makes cross-scene "Entire" blocks play seamlessly
  // and fixes music sometimes failing to start when a scene boundary is crossed.
  function updateMusicPlayback(elapsed: number) {
    const activeBlock = musicBlocksRef.current.find((b) => elapsed >= b.absStart && elapsed < b.absEnd)
    const activeKey = activeBlock?.sceneId ?? null
    if (activeKey === activeMusicBlockKeyRef.current) return
    activeMusicBlockKeyRef.current = activeKey
    if (!activeBlock) {
      stopMusic()
      return
    }
    const remaining = activeBlock.absEnd - elapsed
    if (remaining <= 0) {
      stopMusic()
      return
    }
    if (activeBlock.musicFileUrl) {
      playCustomMusic(activeBlock.musicFileUrl, {
        trimStart: activeBlock.musicTrimStart + (elapsed - activeBlock.absStart),
        playDuration: remaining,
      })
    } else if (findMusic(activeBlock.name)) {
      playMusic(activeBlock.name, { duration: remaining })
    } else {
      stopMusic()
    }
  }

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }
    startRef.current = performance.now() - playhead * 1000
    lastPlayedSceneIdRef.current = null
    activeMusicBlockKeyRef.current = null

    const tick = (now: number) => {
      const elapsed = (now - startRef.current) / 1000
      if (elapsed >= length) {
        setPlayhead(length)
        setPlaying(false)
        stopMusic()
        clearPendingSfx()
        activeMusicBlockKeyRef.current = null
        return
      }
      setPlayhead(elapsed)
      updateMusicPlayback(elapsed)
      const scene = episode.scenes.find((s) => elapsed >= s.start && elapsed < s.end)
      if (scene && scene.id !== lastPlayedSceneIdRef.current) {
        lastPlayedSceneIdRef.current = scene.id
        triggerSceneSfx(scene, elapsed - scene.start)
        // Only follow the playhead into the side panel if it's already open —
        // scrubbing/playing from a closed panel should never pop it open, but
        // once a creator has a scene open they want it to keep pace with Play.
        if (selectedSceneIdRef.current) {
          onSelectScene(scene.id)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, length])

  function togglePlay() {
    if (playing) {
      setPlaying(false)
      stopMusic()
      clearPendingSfx()
      activeMusicBlockKeyRef.current = null
      return
    }
    if (playhead >= length) setPlayhead(0)
    setPlaying(true)
  }

  function toggleMusicScopeMode() {
    setMusicScopeMode((prev) => {
      const next: MusicScopeMode = prev === 'by-scene' ? 'entire' : 'by-scene'
      window.localStorage.setItem(MUSIC_SCOPE_STORAGE_KEY, next)
      return next
    })
  }

  function toggleShowPacing() {
    setShowPacing((prev) => {
      const next = !prev
      window.localStorage.setItem(SHOW_PACING_STORAGE_KEY, next ? 'on' : 'off')
      return next
    })
  }

  function toggleShowRetention() {
    setShowRetention((prev) => {
      const next = !prev
      window.localStorage.setItem(SHOW_RETENTION_STORAGE_KEY, next ? 'on' : 'off')
      return next
    })
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      const target = e.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, playhead, length])

  function seekFromClientX(clientX: number) {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const time = ratio * length
    setPlayhead(time)
  }

  function handleScrubPointerDown(e: React.PointerEvent) {
    if (playing) {
      setPlaying(false)
      stopMusic()
      clearPendingSfx()
      activeMusicBlockKeyRef.current = null
    }
    setSelectedSfxCueId(null)
    setSelectedMusicSceneId(null)
    setScrubbing(true)
    seekFromClientX(e.clientX)
  }

  useEffect(() => {
    if (!scrubbing) return
    function handleMove(e: PointerEvent) {
      seekFromClientX(e.clientX)
    }
    function handleUp() {
      setScrubbing(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing, length, episode.scenes])

  function handleResizePointerDown(e: React.PointerEvent, scene: Scene) {
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    resizeStateRef.current = {
      sceneId: scene.id,
      startClientX: e.clientX,
      startDuration: scene.end - scene.start,
      pxPerSec: rect.width / length,
    }
    setResizing(scene.id)
  }

  useEffect(() => {
    if (!resizing) return
    function handleMove(e: PointerEvent) {
      const state = resizeStateRef.current
      if (!state) return
      const deltaSeconds = (e.clientX - state.startClientX) / state.pxPerSec
      updateSceneDuration(episode.id, state.sceneId, state.startDuration + deltaSeconds)
    }
    function handleUp() {
      resizeStateRef.current = null
      setResizing(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing, episode.id])

  function patchSfxCue(sceneId: string, cueId: string, patch: { offset?: number; duration?: number }) {
    const scene = episodeRef.current.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    updateScene(episodeRef.current.id, sceneId, {
      audio: {
        ...scene.audio,
        sfx: scene.audio.sfx.map((c) => (c.id === cueId ? { ...c, ...patch } : c)),
      },
    })
  }

  function startSfxInteraction(e: React.PointerEvent, block: SfxBlock, mode: 'move' | 'resize-left' | 'resize-right') {
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    sfxDragStateRef.current = {
      cueId: block.cueId,
      sceneId: block.sceneId,
      mode,
      startClientX: e.clientX,
      startOffset: block.offset,
      startDuration: block.blockDuration,
      pxPerSec: rect.width / length,
    }
    setSelectedSfxCueId(block.cueId)
    setInteractingSfx(block.cueId)
  }

  useEffect(() => {
    if (!interactingSfx) return
    function handleMove(e: PointerEvent) {
      const state = sfxDragStateRef.current
      if (!state) return
      const deltaSeconds = (e.clientX - state.startClientX) / state.pxPerSec
      const scene = episodeRef.current.scenes.find((s) => s.id === state.sceneId)
      if (!scene) return
      const sceneDuration = scene.end - scene.start
      const round1 = (n: number) => Math.round(n * 10) / 10
      if (state.mode === 'move') {
        const maxOffset = Math.max(0, sceneDuration - state.startDuration)
        const newOffset = Math.max(0, Math.min(maxOffset, state.startOffset + deltaSeconds))
        patchSfxCue(state.sceneId, state.cueId, { offset: round1(newOffset) })
      } else if (state.mode === 'resize-right') {
        const maxDuration = Math.max(MIN_SFX_BLOCK_SECONDS, sceneDuration - state.startOffset)
        const newDuration = Math.max(MIN_SFX_BLOCK_SECONDS, Math.min(maxDuration, state.startDuration + deltaSeconds))
        patchSfxCue(state.sceneId, state.cueId, { duration: round1(newDuration) })
      } else if (state.mode === 'resize-left') {
        const fixedEnd = state.startOffset + state.startDuration
        const newOffset = Math.max(0, Math.min(fixedEnd - MIN_SFX_BLOCK_SECONDS, state.startOffset + deltaSeconds))
        patchSfxCue(state.sceneId, state.cueId, { offset: round1(newOffset), duration: round1(fixedEnd - newOffset) })
      }
    }
    function handleUp() {
      sfxDragStateRef.current = null
      setInteractingSfx(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactingSfx])

  // Click an SFX block to select it, then press Delete/Backspace to remove it.
  useEffect(() => {
    if (!selectedSfxCueId) return
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      e.preventDefault()
      const scene = episodeRef.current.scenes.find((s) => s.audio.sfx.some((c) => c.id === selectedSfxCueId))
      if (scene) {
        updateScene(episodeRef.current.id, scene.id, {
          audio: { ...scene.audio, sfx: scene.audio.sfx.filter((c) => c.id !== selectedSfxCueId) },
        })
      }
      setSelectedSfxCueId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedSfxCueId, updateScene])

  function patchMusicTiming(sceneId: string, patch: { offset?: number; duration?: number }) {
    const scene = episodeRef.current.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    updateScene(episodeRef.current.id, sceneId, {
      audio: {
        ...scene.audio,
        ...(patch.offset !== undefined && { musicOffset: patch.offset }),
        ...(patch.duration !== undefined && { musicDuration: patch.duration }),
      },
    })
  }

  function startMusicInteraction(
    e: React.PointerEvent,
    block: MusicBlock,
    mode: 'move' | 'resize-left' | 'resize-right',
  ) {
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    musicDragStateRef.current = {
      sceneId: block.sceneId,
      mode,
      startClientX: e.clientX,
      startOffset: block.offset,
      startDuration: block.blockDuration,
      pxPerSec: rect.width / length,
    }
    setSelectedMusicSceneId(block.sceneId)
    setInteractingMusic(block.sceneId)
  }

  useEffect(() => {
    if (!interactingMusic) return
    function handleMove(e: PointerEvent) {
      const state = musicDragStateRef.current
      if (!state) return
      const deltaSeconds = (e.clientX - state.startClientX) / state.pxPerSec
      const scene = episodeRef.current.scenes.find((s) => s.id === state.sceneId)
      if (!scene) return
      const sceneDuration = scene.end - scene.start
      const round1 = (n: number) => Math.round(n * 10) / 10
      if (musicScopeModeRef.current === 'entire') {
        // "Entire" mode: the block is free to span past its owning scene's own
        // boundaries in either direction, clamped only by the full episode length.
        if (state.mode === 'move') {
          const startAbsStart = scene.start + state.startOffset
          const maxAbsStart = Math.max(0, length - state.startDuration)
          const newAbsStart = Math.max(0, Math.min(maxAbsStart, startAbsStart + deltaSeconds))
          // Patch duration too (unchanged) so it never falls back to the
          // scene-relative "sceneDuration - offset" default, which goes
          // negative once the block has moved outside its owning scene.
          patchMusicTiming(state.sceneId, {
            offset: round1(newAbsStart - scene.start),
            duration: round1(state.startDuration),
          })
        } else if (state.mode === 'resize-right') {
          const absStart = scene.start + state.startOffset
          const maxDuration = Math.max(MIN_MUSIC_BLOCK_SECONDS, length - absStart)
          const newDuration = Math.max(MIN_MUSIC_BLOCK_SECONDS, Math.min(maxDuration, state.startDuration + deltaSeconds))
          patchMusicTiming(state.sceneId, { duration: round1(newDuration) })
        } else if (state.mode === 'resize-left') {
          const fixedAbsEnd = scene.start + state.startOffset + state.startDuration
          const newAbsStart = Math.max(
            0,
            Math.min(fixedAbsEnd - MIN_MUSIC_BLOCK_SECONDS, scene.start + state.startOffset + deltaSeconds),
          )
          patchMusicTiming(state.sceneId, {
            offset: round1(newAbsStart - scene.start),
            duration: round1(fixedAbsEnd - newAbsStart),
          })
        }
        return
      }
      if (state.mode === 'move') {
        const maxOffset = Math.max(0, sceneDuration - state.startDuration)
        const newOffset = Math.max(0, Math.min(maxOffset, state.startOffset + deltaSeconds))
        patchMusicTiming(state.sceneId, { offset: round1(newOffset) })
      } else if (state.mode === 'resize-right') {
        const maxDuration = Math.max(MIN_MUSIC_BLOCK_SECONDS, sceneDuration - state.startOffset)
        const newDuration = Math.max(MIN_MUSIC_BLOCK_SECONDS, Math.min(maxDuration, state.startDuration + deltaSeconds))
        patchMusicTiming(state.sceneId, { duration: round1(newDuration) })
      } else if (state.mode === 'resize-left') {
        const fixedEnd = state.startOffset + state.startDuration
        const newOffset = Math.max(0, Math.min(fixedEnd - MIN_MUSIC_BLOCK_SECONDS, state.startOffset + deltaSeconds))
        patchMusicTiming(state.sceneId, { offset: round1(newOffset), duration: round1(fixedEnd - newOffset) })
      }
    }
    function handleUp() {
      musicDragStateRef.current = null
      setInteractingMusic(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactingMusic])

  // Click a Music block to select it, then press Delete/Backspace to clear it.
  useEffect(() => {
    if (!selectedMusicSceneId) return
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      e.preventDefault()
      const scene = episodeRef.current.scenes.find((s) => s.id === selectedMusicSceneId)
      if (scene) {
        updateScene(episodeRef.current.id, scene.id, {
          audio: {
            ...scene.audio,
            music: '',
            musicFileUrl: undefined,
            musicOffset: undefined,
            musicDuration: undefined,
          },
        })
      }
      setSelectedMusicSceneId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedMusicSceneId, updateScene])

  function startRetentionDrag(e: React.PointerEvent, sceneId: string) {
    e.stopPropagation()
    const row = e.currentTarget.closest('[data-retention-row]') as HTMLElement | null
    if (!row) return
    const rect = row.getBoundingClientRect()
    retentionDragStateRef.current = { sceneId, rowTop: rect.top, rowHeight: rect.height }
    setInteractingRetentionSceneId(sceneId)
  }

  useEffect(() => {
    if (!interactingRetentionSceneId) return
    function handleMove(e: PointerEvent) {
      const state = retentionDragStateRef.current
      if (!state) return
      const ratio = 1 - Math.min(1, Math.max(0, (e.clientY - state.rowTop) / state.rowHeight))
      const value = Math.round(ratio * 100)
      const scene = episodeRef.current.scenes.find((s) => s.id === state.sceneId)
      if (!scene) return
      updateScene(episodeRef.current.id, state.sceneId, { retentionTarget: value })
    }
    function handleUp() {
      retentionDragStateRef.current = null
      setInteractingRetentionSceneId(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactingRetentionSceneId])

  const majorStep = length <= 15 ? 1 : length <= 40 ? 5 : 10
  const secondTicks = Array.from({ length: Math.floor(length) + 1 }, (_, i) => i)

  const sfxBlocks = computeSfxBlocks(episode.scenes)
  const sfxLaneOf = packSfxLanes(sfxBlocks)
  const sfxLaneCount = Math.max(1, ...Array.from(sfxLaneOf.values(), (v) => v + 1))
  const sfxLanesHeight = sfxLaneCount * SFX_ROW_HEIGHT

  const sceneDurations = episode.scenes.map((s) => s.end - s.start)
  const maxSceneDuration = Math.max(1, ...sceneDurations)
  const avgSceneDuration = sceneDurations.reduce((a, b) => a + b, 0) / Math.max(1, sceneDurations.length)

  const retentionPoints = [
    { x: 0, value: 100 },
    ...episode.scenes.map((scene, i) => ({
      x: (scene.end / length) * 1000,
      value: scene.retentionTarget ?? defaultRetentionTarget(i, episode.scenes.length),
      sceneId: scene.id,
    })),
  ]
  const retentionLinePoints = retentionPoints
    .map((p) => `${p.x},${(1 - p.value / 100) * RETENTION_ROW_HEIGHT}`)
    .join(' ')

  return (
    <div className="border-b border-border px-8 py-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-elevated text-ink transition hover:bg-gold hover:text-[#141316]"
          >
            {playing ? (
              <div className="flex gap-[3px]">
                <span className="h-3 w-[3px] bg-current" />
                <span className="h-3 w-[3px] bg-current" />
              </div>
            ) : (
              <div className="ml-0.5 h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-current" />
            )}
          </button>
          <span className="font-mono text-[12.5px] text-ink-dim">
            {formatTime(playhead)} <span className="text-ink-faint">/ {formatTime(length)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleShowPacing}
            title="Show/hide the Pacing row"
            aria-label="Show/hide the Pacing row"
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
              showPacing
                ? 'border-gold text-gold'
                : 'border-border text-ink-dim hover:border-gold hover:text-gold'
            }`}
          >
            Pacing: {showPacing ? 'On' : 'Off'}
          </button>
          <button
            onClick={toggleShowRetention}
            title="Show/hide the Retention row"
            aria-label="Show/hide the Retention row"
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
              showRetention
                ? 'border-gold text-gold'
                : 'border-border text-ink-dim hover:border-gold hover:text-gold'
            }`}
          >
            Retention: {showRetention ? 'On' : 'Off'}
          </button>
          <button
            onClick={toggleMusicScopeMode}
            title="Toggle whether music blocks can be dragged/resized across scene boundaries"
            aria-label="Toggle whether music blocks can be dragged/resized across scene boundaries"
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
              musicScopeMode === 'entire'
                ? 'border-gold text-gold'
                : 'border-border text-ink-dim hover:border-gold hover:text-gold'
            }`}
          >
            Music Audio: {musicScopeMode === 'entire' ? 'Entire' : 'By Scene'}
          </button>
          <button
            onClick={onAddScene}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-ink-dim transition hover:border-gold hover:text-gold"
          >
            <Plus size={13} strokeWidth={2} />
            Scene
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative">
        {/* Timecode ruler — per-second ticks, drag anywhere to scrub */}
        <div
          onPointerDown={handleScrubPointerDown}
          className="relative h-6 w-full cursor-pointer touch-none rounded-t-md bg-surface-2/50 select-none"
        >
          <div className="absolute inset-x-0 bottom-0 h-px bg-border" />
          {secondTicks.map((t) => {
            const isMajor = t % majorStep === 0
            return (
              <div key={t} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${(t / length) * 100}%` }}>
                {isMajor && (
                  <span className="absolute bottom-[11px] left-1/2 -translate-x-1/2 text-[9.5px] whitespace-nowrap text-ink-faint">
                    {t}s
                  </span>
                )}
                <span className={`block w-px ${isMajor ? 'h-2.5 bg-ink-dim' : 'h-1.5 bg-ink-faint/40'}`} />
              </div>
            )
          })}
        </div>

        {/* Scene blocks — click/drag to scrub, drag right edge to resize duration */}
        <div
          onPointerDown={handleScrubPointerDown}
          style={{ height: trackHeight }}
          className="relative flex w-full cursor-pointer touch-none gap-[3px] overflow-hidden bg-surface-2 select-none"
        >
          {episode.scenes.map((scene: Scene) => {
            const widthPct = ((scene.end - scene.start) / length) * 100
            const color = PURPOSE_COLOR[scene.purpose] ?? '#d3a75c'
            const isSelected = scene.id === selectedSceneId
            return (
              <div
                key={scene.id}
                onClick={() => onSelectScene(scene.id)}
                title="Click to open this scene · drag anywhere in this row to scrub"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: `${color}${isSelected ? '38' : '20'}`,
                  borderColor: isSelected ? color : 'transparent',
                }}
                className="group relative flex h-full min-w-[8px] shrink-0 flex-col justify-between overflow-hidden rounded-md border-2 px-2 py-1.5 text-left transition"
              >
                <span className="flex items-center gap-1">
                  <Icon name={scene.thumbnailIcon} size={11} style={{ color }} />
                  <span className="truncate text-[10px] font-medium" style={{ color }}>
                    {scene.purpose}
                  </span>
                </span>
                <span className="text-[9.5px] text-ink-faint">
                  {formatTime(scene.start)}–{formatTime(scene.end)}
                </span>

                <div
                  onPointerDown={(e) => handleResizePointerDown(e, scene)}
                  className={`absolute top-0 right-0 z-10 flex h-full w-2.5 cursor-col-resize items-center justify-center transition ${
                    resizing === scene.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <span className="h-5 w-[3px] rounded-full bg-white/70" />
                </div>
              </div>
            )
          })}
        </div>

        {showPacing && (
          /* Pacing strip — bar height is each scene's duration relative to the longest
             scene, so a saggy middle or a hook that's too slow shows up at a glance. */
          <div
            onPointerDown={handleScrubPointerDown}
            style={{ height: PACING_ROW_HEIGHT }}
            className="relative flex w-full cursor-pointer touch-none items-end gap-[3px] overflow-hidden border-t border-border-soft bg-surface px-0 select-none"
          >
            <span className="pointer-events-none absolute top-1 left-1.5 z-10 text-[8.5px] font-semibold tracking-wide text-ink-faint/70 uppercase">
              Pacing
            </span>
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-faint/25"
              style={{ bottom: `${(avgSceneDuration / maxSceneDuration) * 100}%` }}
            />
            {episode.scenes.map((scene: Scene) => {
              const widthPct = ((scene.end - scene.start) / length) * 100
              const duration = scene.end - scene.start
              const heightPct = Math.max(8, (duration / maxSceneDuration) * 100)
              const color = PURPOSE_COLOR[scene.purpose] ?? '#d3a75c'
              const isSelected = scene.id === selectedSceneId
              return (
                <div
                  key={scene.id}
                  title={`${scene.purpose}: ${duration}s`}
                  style={{ width: `${widthPct}%`, height: `${heightPct}%` }}
                  className="group relative flex h-full min-w-[6px] shrink-0 items-end"
                >
                  <div
                    className="w-full rounded-[2px] transition group-hover:opacity-90"
                    style={{
                      height: '100%',
                      backgroundColor: color,
                      opacity: isSelected ? 0.85 : 0.5,
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}

        {showRetention && (
          /* Retention curve — drag a point to set the planned % of viewers still
             watching by the end of that scene. Undragged points show a mild
             built-in decline so the graph never looks flat/broken. */
          <div
            data-retention-row
            onPointerDown={handleScrubPointerDown}
            style={{ height: RETENTION_ROW_HEIGHT }}
            className="relative w-full cursor-pointer touch-none overflow-hidden border-t border-border-soft bg-surface select-none"
          >
            <span className="pointer-events-none absolute top-1 left-1.5 z-10 text-[8.5px] font-semibold tracking-wide text-ink-faint/70 uppercase">
              Retention
            </span>
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-ink-faint/25" />
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 1000 ${RETENTION_ROW_HEIGHT}`}
              preserveAspectRatio="none"
            >
              <polyline
                points={retentionLinePoints}
                fill="none"
                stroke="#4fa8a0"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              {retentionPoints.slice(1).map((p, i) => {
                const scene = episode.scenes[i]
                const isInteracting = interactingRetentionSceneId === scene.id
                return (
                  <circle
                    key={scene.id}
                    cx={p.x}
                    cy={(1 - p.value / 100) * RETENTION_ROW_HEIGHT}
                    r={isInteracting ? 5 : 3.5}
                    vectorEffect="non-scaling-stroke"
                    fill={isInteracting ? '#4fa8a0' : '#f4ede1'}
                    stroke="#4fa8a0"
                    strokeWidth={1.5}
                    className="cursor-ns-resize"
                    onPointerDown={(e) => startRetentionDrag(e, scene.id)}
                  >
                    <title>{`${scene.purpose}: ${Math.round(p.value)}% retention`}</title>
                  </circle>
                )
              })}
            </svg>
            {interactingRetentionSceneId &&
              (() => {
                const idx = episode.scenes.findIndex((s) => s.id === interactingRetentionSceneId)
                const p = retentionPoints[idx + 1]
                if (!p) return null
                return (
                  <span
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded bg-elevated px-1.5 py-0.5 text-[9.5px] font-medium text-ink shadow"
                    style={{ left: `${(p.x / 1000) * 100}%`, top: `${(1 - p.value / 100) * 100}%`, marginTop: -6 }}
                  >
                    {Math.round(p.value)}%
                  </span>
                )
              })()}
          </div>
        )}

        {/* Music lane — drag a block to move it, drag an edge to trim it, click + Delete to clear it */}
        <div
          onPointerDown={handleScrubPointerDown}
          style={{ height: MUSIC_LANE_HEIGHT }}
          className="relative w-full cursor-pointer touch-none overflow-hidden border-t border-border-soft bg-surface select-none"
        >
          <span className="pointer-events-none absolute top-1/2 left-1.5 z-10 -translate-y-1/2 text-[8.5px] font-semibold tracking-wide text-ink-faint/70 uppercase">
            Music
          </span>
          {musicBlocks.map((block) => {
            const leftPct = (block.absStart / length) * 100
            const widthPct = (block.blockDuration / length) * 100
            const isInteracting = interactingMusic === block.sceneId
            const isSelected = selectedMusicSceneId === block.sceneId
            return (
              <div
                key={block.sceneId}
                onPointerDown={(e) => startMusicInteraction(e, block, 'move')}
                title="Drag to move · drag an edge to trim · press Delete to clear"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  top: 2,
                  height: MUSIC_LANE_HEIGHT - 4,
                  backgroundColor: `${block.color}30`,
                  borderColor: block.color,
                }}
                className={`group absolute flex cursor-grab items-center overflow-hidden rounded border px-1.5 transition active:cursor-grabbing ${
                  isInteracting ? 'z-20' : ''
                } ${isSelected ? 'ring-2 ring-gold' : ''}`}
              >
                <div
                  onPointerDown={(e) => startMusicInteraction(e, block, 'resize-left')}
                  className="absolute top-0 left-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100"
                  style={{ backgroundColor: block.color }}
                />
                <span className="truncate text-[9px] font-medium" style={{ color: block.color }}>
                  {block.name}
                </span>
                <div
                  onPointerDown={(e) => startMusicInteraction(e, block, 'resize-right')}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100"
                  style={{ backgroundColor: block.color }}
                />
              </div>
            )
          })}
        </div>

        {/* SFX lane(s) — drag a block to move it, drag an edge to trim it, click + Delete to remove it */}
        <div
          onPointerDown={handleScrubPointerDown}
          style={{ height: sfxLanesHeight }}
          className="relative w-full cursor-pointer touch-none overflow-hidden rounded-b-lg border-t border-border-soft bg-surface select-none"
        >
          <span className="pointer-events-none absolute top-1/2 left-1.5 z-10 -translate-y-1/2 text-[8.5px] font-semibold tracking-wide text-ink-faint/70 uppercase">
            SFX
          </span>
          {sfxBlocks.map((block) => {
            const lane = sfxLaneOf.get(block.cueId) ?? 0
            const leftPct = (block.absStart / length) * 100
            const widthPct = (block.blockDuration / length) * 100
            const isInteracting = interactingSfx === block.cueId
            const isSelected = selectedSfxCueId === block.cueId
            return (
              <div
                key={block.cueId}
                onPointerDown={(e) => startSfxInteraction(e, block, 'move')}
                title="Drag to move · drag an edge to trim · press Delete to remove"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  top: lane * SFX_ROW_HEIGHT,
                  height: SFX_ROW_HEIGHT - 3,
                  backgroundColor: `${block.color}40`,
                  borderColor: block.color,
                }}
                className={`group absolute flex cursor-grab items-center overflow-hidden rounded border px-1.5 transition active:cursor-grabbing ${
                  isInteracting ? 'z-20' : ''
                } ${isSelected ? 'ring-2 ring-gold' : ''}`}
              >
                <div
                  onPointerDown={(e) => startSfxInteraction(e, block, 'resize-left')}
                  className="absolute top-0 left-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100"
                  style={{ backgroundColor: block.color }}
                />
                <span className="truncate text-[9px] font-medium text-ink" style={{ color: block.color }}>
                  {block.name}
                </span>
                <div
                  onPointerDown={(e) => startSfxInteraction(e, block, 'resize-right')}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100"
                  style={{ backgroundColor: block.color }}
                />
              </div>
            )
          })}
        </div>

        <div
          className="pointer-events-none absolute top-0 left-0 w-full"
          style={{
            height:
              trackHeight +
              RULER_HEIGHT +
              (showPacing ? PACING_ROW_HEIGHT : 0) +
              (showRetention ? RETENTION_ROW_HEIGHT : 0) +
              MUSIC_LANE_HEIGHT +
              sfxLanesHeight,
          }}
        >
          <div
            className="absolute top-0 h-full w-[2px] bg-gold"
            style={{
              left: `${(playhead / length) * 100}%`,
              transition: playing || scrubbing ? 'none' : 'left 150ms',
            }}
          >
            <div className="absolute -top-1.5 -left-[3px] h-2 w-2 rotate-45 bg-gold" />
          </div>
        </div>
      </div>
    </div>
  )
}
