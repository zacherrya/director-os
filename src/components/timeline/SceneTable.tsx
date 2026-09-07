import type { Episode } from '../../lib/types'
import { PURPOSE_COLOR } from '../../lib/types'
import { SceneThumbnail } from '../SceneThumbnail'
import { Icon, MoreHorizontal, Plus, Trash2 } from '../Icon'
import { useAppStore } from '../../store/appStore'
import { useState, useSyncExternalStore } from 'react'
import {
  customMusicKey,
  findMusic,
  findSfx,
  getPlayingMusicId,
  onMusicChange,
  playCustomMusic,
  playSfx,
  stopMusic,
  toggleMusic,
} from '../../lib/audioEngine'

function formatRange(start: number, end: number) {
  return `0:${String(start).padStart(2, '0')} – 0:${String(end).padStart(2, '0')}`
}

export function SceneTable({
  episode,
  selectedSceneId,
  onSelectScene,
  onAddScene,
}: {
  episode: Episode
  selectedSceneId: string | null
  onSelectScene: (sceneId: string) => void
  onAddScene: () => void
}) {
  const duplicateScene = useAppStore((s) => s.duplicateScene)
  const deleteScene = useAppStore((s) => s.deleteScene)
  const updateSceneDuration = useAppStore((s) => s.updateSceneDuration)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const playingMusicId = useSyncExternalStore(onMusicChange, getPlayingMusicId, () => null)

  const gridCols = 'grid-cols-[56px_72px_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_60px_24px]'

  return (
    <div className="min-w-0 px-8 pb-10">
      <div
        className={`grid ${gridCols} gap-3 border-b border-border-soft px-2 pb-2.5 text-[11px] font-medium tracking-wide text-ink-faint uppercase`}
      >
        <span>Scene</span>
        <span>Storyboard</span>
        <span>Dialogue</span>
        <span>Music</span>
        <span>SFX</span>
        <span>On Screen Text</span>
        <span className="text-right">Duration</span>
        <span />
      </div>

      <div className="divide-y divide-border-soft">
        {episode.scenes.map((scene) => {
          const color = PURPOSE_COLOR[scene.purpose] ?? '#d3a75c'
          const isSelected = scene.id === selectedSceneId
          const musicDef = findMusic(scene.audio.music)
          const isCustomMusic = Boolean(scene.audio.musicFileUrl)
          const isMusicPlaying = isCustomMusic
            ? playingMusicId === customMusicKey(scene.audio.musicFileUrl!)
            : musicDef && playingMusicId === musicDef.id

          return (
            <div
              key={scene.id}
              onClick={() => onSelectScene(scene.id)}
              className={`group grid cursor-pointer ${gridCols} items-center gap-3 px-2 py-3.5 transition ${
                isSelected ? 'bg-gold-soft' : 'hover:bg-surface-2'
              }`}
            >
              <div>
                <div className="text-[13px] font-medium text-ink">{scene.index}</div>
                <div className="text-[10.5px] text-ink-faint">{formatRange(scene.start, scene.end)}</div>
                <div className="mt-1 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-ink-dim">{scene.purpose}</span>
                </div>
              </div>

              <SceneThumbnail scene={scene} className="h-14 w-[72px]" />

              <p className="line-clamp-2 min-w-0 text-[12.5px] leading-snug whitespace-pre-line text-ink-dim">
                {scene.dialogue || <span className="text-ink-faint italic">No dialogue yet</span>}
              </p>

              <div className="min-w-0">
                {scene.audio.music ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isCustomMusic) {
                        if (isMusicPlaying) stopMusic()
                        else
                          playCustomMusic(scene.audio.musicFileUrl!, {
                            trimStart: scene.audio.musicTrimStart ?? 0,
                            playDuration: scene.end - scene.start,
                          })
                      } else if (musicDef) toggleMusic(scene.audio.music)
                    }}
                    className={`flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition ${
                      isMusicPlaying ? 'bg-gold-soft text-gold' : 'bg-surface-2 text-ink-dim hover:text-gold'
                    }`}
                    title={musicDef || isCustomMusic ? (isMusicPlaying ? 'Stop preview' : 'Preview music') : undefined}
                  >
                    {(musicDef || isCustomMusic) && <Icon name="music" size={9} className="shrink-0" />}
                    <span className="truncate">{scene.audio.music}</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-ink-faint italic">—</span>
                )}
              </div>

              <div className="flex min-w-0 flex-wrap gap-1">
                {scene.audio.sfx.length > 0 ? (
                  scene.audio.sfx.slice(0, 2).map((cue) => {
                    const def = findSfx(cue.name)
                    return (
                      <button
                        key={cue.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (def) playSfx(cue.name, { duration: cue.duration })
                        }}
                        className="max-w-full truncate rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-ink-faint transition hover:text-gold"
                        title={def ? `Preview · @${cue.offset}s` : undefined}
                      >
                        {cue.name}
                        <span className="text-ink-faint/70"> @{cue.offset}s</span>
                      </button>
                    )
                  })
                ) : (
                  <span className="text-[11px] text-ink-faint italic">—</span>
                )}
              </div>

              <div className="min-w-0">
                {scene.onScreenText.text ? (
                  <>
                    <div className="line-clamp-2 text-[12px] font-medium whitespace-pre-line text-ink">
                      {scene.onScreenText.text}
                    </div>
                    <div className="text-[10px] text-ink-faint">{scene.onScreenText.animation}</div>
                  </>
                ) : (
                  <span className="text-[11px] text-ink-faint italic">—</span>
                )}
              </div>

              <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={scene.end - scene.start}
                  onChange={(e) => updateSceneDuration(episode.id, scene.id, Number(e.target.value))}
                  className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-[12.5px] text-ink-dim transition hover:border-border focus:border-gold focus:bg-surface-2"
                />
                <span className="text-[11px] text-ink-faint">s</span>
              </div>

              <div className="relative flex justify-end">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuFor(menuFor === scene.id ? null : scene.id)
                  }}
                  className="rounded-md p-1 text-ink-faint opacity-0 transition group-hover:opacity-100 hover:bg-surface-2 hover:text-ink"
                >
                  <MoreHorizontal size={15} />
                </button>
                {menuFor === scene.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-6 right-0 z-10 w-36 rounded-lg border border-border bg-elevated py-1 shadow-lg"
                  >
                    <button
                      onClick={() => {
                        duplicateScene(episode.id, scene.id)
                        setMenuFor(null)
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[12px] text-ink-dim hover:bg-surface-2 hover:text-ink"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => {
                        deleteScene(episode.id, scene.id)
                        setMenuFor(null)
                      }}
                      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12px] text-red-400 hover:bg-surface-2"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={onAddScene}
        className="mt-4 flex items-center gap-1.5 rounded-lg px-2 py-2 text-[12.5px] font-medium text-ink-faint transition hover:text-gold"
      >
        <Plus size={14} strokeWidth={2} />
        Add Scene
      </button>
    </div>
  )
}
