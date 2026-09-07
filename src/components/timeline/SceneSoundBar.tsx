import type { Episode, Scene } from '../../lib/types'
import { useSceneAudioActions } from '../../lib/useSceneAudio'
import { MusicPicker } from './MusicPicker'
import { SfxPicker } from './SfxPicker'
import { AudioRegionSelector } from './AudioRegionSelector'
import { Icon } from '../Icon'

/** Always-visible Music + SFX quick-add strip under the timeline, so adding
 * sound to the selected scene doesn't require opening the side panel. */
export function SceneSoundBar({ episode, scene }: { episode: Episode; scene: Scene | null }) {
  if (!scene) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-8 py-4 text-[12.5px] text-ink-faint">
        <Icon name="music" size={14} />
        Select a scene above to add music or SFX.
      </div>
    )
  }
  return <SceneSoundBarInner episode={episode} scene={scene} />
}

function SceneSoundBarInner({ episode, scene }: { episode: Episode; scene: Scene }) {
  const audio = useSceneAudioActions(episode.id, scene)

  return (
    <div className="max-h-[300px] shrink-0 overflow-y-auto border-t border-border bg-surface px-8 py-4">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
        <Icon name="music" size={12} />
        Scene {scene.index} Sound
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
        <div className="space-y-3">
          <MusicPicker
            value={scene.audio.music}
            fileUrl={scene.audio.musicFileUrl}
            onChange={audio.onMusicChange}
            onUploadFile={audio.onMusicUploadFile}
            onRemoveFile={audio.onMusicRemoveFile}
            trimStart={scene.audio.musicTrimStart ?? 0}
            previewDuration={scene.end - scene.start}
          />
          {scene.audio.musicFileUrl && (
            <AudioRegionSelector
              fileUrl={scene.audio.musicFileUrl}
              sceneDuration={scene.end - scene.start}
              trimStart={scene.audio.musicTrimStart ?? 0}
              onChange={audio.onMusicTrimChange}
            />
          )}
        </div>
        <SfxPicker
          selected={scene.audio.sfx}
          sceneDuration={scene.end - scene.start}
          onAdd={audio.onSfxAdd}
          onRemoveByName={audio.onSfxRemoveByName}
          onRemove={audio.onSfxRemove}
          onUpdate={audio.onSfxUpdate}
        />
      </div>
    </div>
  )
}
