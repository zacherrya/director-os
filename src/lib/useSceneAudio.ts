import { useAppStore } from '../store/appStore'
import { putFile } from './fileStore'
import type { AudioDirection, Scene, SceneSfxCue } from './types'

function newCueId() {
  return `sfxcue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function newFileId() {
  return `musicfile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Shared read/write handlers for a scene's Music + SFX, used by both the
 * Scene Panel's Audio tab and the timeline's always-visible quick-add bar. */
export function useSceneAudioActions(episodeId: string, scene: Scene) {
  const updateScene = useAppStore((s) => s.updateScene)

  function patch(p: Partial<AudioDirection>) {
    updateScene(episodeId, scene.id, { audio: { ...scene.audio, ...p } })
  }

  return {
    onMusicChange: (v: string) => patch({ music: v, musicFileUrl: undefined, musicFileId: undefined }),
    onMusicUploadFile: (file: File) => {
      const id = newFileId()
      const url = URL.createObjectURL(file)
      patch({ music: file.name, musicFileUrl: url, musicFileId: id })
      // Fire-and-forget: the blob URL above already makes the track playable
      // this session; persisting the bytes is what lets it survive a reload.
      void putFile(id, file)
    },
    onMusicRemoveFile: () =>
      patch({
        musicFileUrl: undefined,
        musicFileId: undefined,
        music: '',
        musicOffset: undefined,
        musicDuration: undefined,
      }),
    onMusicTrimChange: (v: number) => patch({ musicTrimStart: v }),
    onMusicTimingUpdate: (timingPatch: { offset?: number; duration?: number }) =>
      patch({
        ...(timingPatch.offset !== undefined && { musicOffset: timingPatch.offset }),
        ...(timingPatch.duration !== undefined && { musicDuration: timingPatch.duration }),
      }),
    onSfxAdd: (name: string) => patch({ sfx: [...scene.audio.sfx, { id: newCueId(), name, offset: 0 }] }),
    onSfxRemove: (id: string) => patch({ sfx: scene.audio.sfx.filter((x) => x.id !== id) }),
    onSfxRemoveByName: (name: string) => patch({ sfx: scene.audio.sfx.filter((x) => x.name !== name) }),
    onSfxUpdate: (id: string, cuePatch: Partial<SceneSfxCue>) =>
      patch({ sfx: scene.audio.sfx.map((x) => (x.id === id ? { ...x, ...cuePatch } : x)) }),
  }
}
