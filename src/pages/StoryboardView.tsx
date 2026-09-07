import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useAppStore } from '../store/appStore'
import { TimelineHeader } from '../components/timeline/TimelineHeader'
import { ScenePanel } from '../components/timeline/ScenePanel'
import { StoryboardCard } from '../components/StoryboardCard'
import { Plus } from '../components/Icon'

export function StoryboardView() {
  const { projectId, episodeId } = useParams()
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const episode = useAppStore((s) => s.episodes.find((e) => e.id === episodeId))
  const reorderScenes = useAppStore((s) => s.reorderScenes)
  const addScene = useAppStore((s) => s.addScene)
  const deleteScene = useAppStore((s) => s.deleteScene)
  const setSceneImage = useAppStore((s) => s.setSceneImage)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [visualFocusToken, setVisualFocusToken] = useState(0)

  function openVisualGenerate(sceneId: string) {
    setSelectedSceneId(sceneId)
    setVisualFocusToken((t) => t + 1)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  if (!project || !episode) {
    return (
      <div className="flex h-full items-center justify-center text-ink-dim">
        Episode not found. <Link to="/projects" className="ml-2 text-gold">Back to Projects</Link>
      </div>
    )
  }

  const selectedScene = episode.scenes.find((s) => s.id === selectedSceneId) ?? null

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = episode!.scenes.map((s) => s.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    const reordered = [...ids]
    reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, String(active.id))
    reorderScenes(episode!.id, reordered)
  }

  function navigateScene(direction: 1 | -1) {
    if (!selectedScene) return
    const idx = episode!.scenes.findIndex((s) => s.id === selectedScene.id)
    const nextIdx = (idx + direction + episode!.scenes.length) % episode!.scenes.length
    setSelectedSceneId(episode!.scenes[nextIdx].id)
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TimelineHeader project={project} episode={episode} />
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={episode.scenes.map((s) => s.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {episode.scenes.map((scene, i) => (
                  <motion.div
                    key={scene.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.03 }}
                  >
                    <StoryboardCard
                      scene={scene}
                      isSelected={scene.id === selectedSceneId}
                      onSelect={() => setSelectedSceneId(scene.id)}
                      onDelete={() => {
                        if (selectedSceneId === scene.id) setSelectedSceneId(null)
                        deleteScene(episode.id, scene.id)
                      }}
                      onImageChange={(dataUrl) => {
                        void setSceneImage(episode.id, scene.id, dataUrl)
                      }}
                      onGenerateClick={() => openVisualGenerate(scene.id)}
                    />
                  </motion.div>
                ))}
                <button
                  onClick={() => setSelectedSceneId(addScene(episode.id).id)}
                  className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-ink-faint transition hover:border-gold hover:text-gold"
                >
                  <Plus size={20} />
                  <span className="text-[12.5px] font-medium">Add Scene</span>
                </button>
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
      <AnimatePresence>
        {selectedScene && (
          <ScenePanel
            episode={episode}
            scene={selectedScene}
            onClose={() => setSelectedSceneId(null)}
            onNavigate={navigateScene}
            focusVisual={visualFocusToken || undefined}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
