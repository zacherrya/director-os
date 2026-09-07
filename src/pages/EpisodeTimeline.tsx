import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { TimelineHeader } from '../components/timeline/TimelineHeader'
import { TimelineRuler } from '../components/timeline/TimelineRuler'
import { SceneTable } from '../components/timeline/SceneTable'
import { ScenePanel } from '../components/timeline/ScenePanel'
import { SceneSoundBar } from '../components/timeline/SceneSoundBar'
import { PreviewPlayer } from '../components/timeline/PreviewPlayer'
import { DraftCheckPanel } from '../components/timeline/DraftCheckPanel'

const MIN_TRACK_HEIGHT = 40
const MAX_TRACK_HEIGHT = 280
const TRACK_HEIGHT_STORAGE_KEY = 'director-os-track-height'

function loadTrackHeight(): number {
  if (typeof window === 'undefined') return 64
  const stored = Number(window.localStorage.getItem(TRACK_HEIGHT_STORAGE_KEY))
  return stored >= MIN_TRACK_HEIGHT && stored <= MAX_TRACK_HEIGHT ? stored : 64
}

export function EpisodeTimeline() {
  const { projectId, episodeId } = useParams()
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const episode = useAppStore((s) => s.episodes.find((e) => e.id === episodeId))
  const addScene = useAppStore((s) => s.addScene)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)

  // `?scene=` lets other pages (the Analytics drop-off diagnosis) open this
  // episode with one scene already selected. Consumed once, then cleared so it
  // doesn't re-select on every later render.
  useEffect(() => {
    const requested = searchParams.get('scene')
    if (!requested) return
    setSelectedSceneId(requested)
    searchParams.delete('scene')
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, setSearchParams])
  const [trackHeight, setTrackHeight] = useState(loadTrackHeight)
  const [resizingTrack, setResizingTrack] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const trackDragRef = useRef<{ y: number; height: number } | null>(null)

  function handleTrackResizeStart(e: React.PointerEvent) {
    trackDragRef.current = { y: e.clientY, height: trackHeight }
    setResizingTrack(true)
  }

  useEffect(() => {
    if (!resizingTrack) return
    function handleMove(e: PointerEvent) {
      const start = trackDragRef.current
      if (!start) return
      const delta = e.clientY - start.y
      setTrackHeight(Math.max(MIN_TRACK_HEIGHT, Math.min(MAX_TRACK_HEIGHT, start.height + delta)))
    }
    function handleUp() {
      trackDragRef.current = null
      setResizingTrack(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [resizingTrack])

  useEffect(() => {
    window.localStorage.setItem(TRACK_HEIGHT_STORAGE_KEY, String(trackHeight))
  }, [trackHeight])

  if (!project || !episode) {
    return (
      <div className="flex h-full items-center justify-center text-ink-dim">
        Episode not found. <Link to="/projects" className="ml-2 text-gold">Back to Projects</Link>
      </div>
    )
  }

  const selectedScene = episode.scenes.find((s) => s.id === selectedSceneId) ?? null

  function navigateScene(direction: 1 | -1) {
    if (!selectedScene) return
    const idx = episode!.scenes.findIndex((s) => s.id === selectedScene.id)
    const nextIdx = (idx + direction + episode!.scenes.length) % episode!.scenes.length
    setSelectedSceneId(episode!.scenes[nextIdx].id)
  }

  function handleAddScene() {
    const s = addScene(episode!.id)
    setSelectedSceneId(s.id)
  }

  return (
    <div className="flex h-full">
      <div className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-surface/40 px-5 py-6">
        <div className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Preview</div>
        <PreviewPlayer episode={episode} playhead={playhead} playing={playing} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TimelineHeader project={project} episode={episode} />
        <DraftCheckPanel episode={episode} onSelectScene={setSelectedSceneId} />
        <TimelineRuler
          episode={episode}
          selectedSceneId={selectedSceneId}
          onSelectScene={setSelectedSceneId}
          onAddScene={handleAddScene}
          trackHeight={trackHeight}
          playing={playing}
          onPlayingChange={setPlaying}
          playhead={playhead}
          onPlayheadChange={setPlayhead}
        />

        <div
          onPointerDown={handleTrackResizeStart}
          className="group relative z-10 h-2 shrink-0 cursor-row-resize touch-none select-none"
          title="Drag to resize the timeline"
        >
          <div
            className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition ${
              resizingTrack ? 'bg-gold' : 'bg-border-soft group-hover:bg-gold/50'
            }`}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SceneTable
            episode={episode}
            selectedSceneId={selectedSceneId}
            onSelectScene={setSelectedSceneId}
            onAddScene={handleAddScene}
          />
        </div>

        <SceneSoundBar episode={episode} scene={selectedScene} />
      </div>
      <AnimatePresence>
        {selectedScene && (
          <ScenePanel
            episode={episode}
            scene={selectedScene}
            onClose={() => setSelectedSceneId(null)}
            onNavigate={navigateScene}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
