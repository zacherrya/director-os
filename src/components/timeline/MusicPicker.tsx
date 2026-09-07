import { useRef, useSyncExternalStore } from 'react'
import {
  MUSIC_LIBRARY,
  customMusicKey,
  getPlayingMusicId,
  onMusicChange,
  playCustomMusic,
  playMusic,
  stopMusic,
} from '../../lib/audioEngine'
import { ChevronDown, Icon, Pause, Play, X } from '../Icon'

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: readonly string[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-border bg-surface-2 px-3 py-2 pr-8 text-[13px] text-ink transition focus:border-gold"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint" />
    </div>
  )
}

export function useCurrentlyPlayingMusic() {
  return useSyncExternalStore(onMusicChange, getPlayingMusicId, () => null)
}

export function MusicPicker({
  value,
  fileUrl,
  onChange,
  onUploadFile,
  onRemoveFile,
  label = 'Music',
  trimStart,
  previewDuration,
}: {
  value: string
  fileUrl?: string
  onChange: (v: string) => void
  onUploadFile: (file: File) => void
  onRemoveFile: () => void
  label?: string
  /** When set (scene-level music), preview plays only the selected trimmed segment, matching timeline playback. */
  trimStart?: number
  previewDuration?: number
}) {
  const playingId = useCurrentlyPlayingMusic()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onUploadFile(file)
  }

  if (fileUrl) {
    const isThisPlaying = playingId === customMusicKey(fileUrl)
    return (
      <div>
        <div className="mb-1.5 text-[11.5px] font-medium text-ink-dim">{label}</div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <Icon name="music" size={14} className="shrink-0 text-gold" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={value}>
            {value || 'Uploaded track'}
          </span>
          <button
            onClick={() =>
              isThisPlaying
                ? stopMusic()
                : playCustomMusic(fileUrl, { trimStart, playDuration: previewDuration })
            }
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${
              isThisPlaying ? 'text-gold' : 'text-ink-faint hover:text-gold'
            }`}
            title={isThisPlaying ? 'Stop preview' : 'Preview music'}
          >
            {isThisPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={onRemoveFile}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint hover:text-red-400"
            title="Remove uploaded track"
            aria-label="Remove uploaded track"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  const options =
    value && !MUSIC_LIBRARY.some((m) => m.label === value)
      ? [value, ...MUSIC_LIBRARY.map((m) => m.label)]
      : MUSIC_LIBRARY.map((m) => m.label)
  const isThisPlaying = playingId !== null && MUSIC_LIBRARY.find((m) => m.label === value)?.id === playingId
  const activeDef = MUSIC_LIBRARY.find((m) => m.label === value)

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-medium text-ink-dim">
        <span>{label}</span>
        {activeDef && <span className="text-ink-faint">{activeDef.mood}</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Select value={value || MUSIC_LIBRARY[0].label} onChange={onChange} options={options} />
        </div>
        <button
          onClick={() => (isThisPlaying ? stopMusic() : value && playMusic(value))}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
            isThisPlaying ? 'border-gold bg-gold-soft text-gold' : 'border-border text-ink-dim hover:border-gold hover:text-gold'
          }`}
          title={isThisPlaying ? 'Stop preview' : 'Preview music'}
        >
          {isThisPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="mt-1.5 text-[11px] font-medium text-gold hover:text-gold-bright"
      >
        Upload from Finder…
      </button>
      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFile} />
    </div>
  )
}
