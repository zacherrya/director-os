import { useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Scene } from '../lib/types'
import { PURPOSE_COLOR } from '../lib/types'
import { SceneThumbnail } from './SceneThumbnail'
import { Check, GripVertical, Icon, Trash2, X } from './Icon'

export function StoryboardCard({
  scene,
  isSelected,
  onSelect,
  onDelete,
  onImageChange,
  onGenerateClick,
}: {
  scene: Scene
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onImageChange: (dataUrl: string | null) => void
  /** Opens the scene panel focused on the Visual field's AI generate section, instead of generating inline. */
  onGenerateClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id })
  const color = PURPOSE_COLOR[scene.purpose] ?? '#d3a75c'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onImageChange(reader.result as string)
    reader.readAsDataURL(file)
  }


  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-surface shadow-sm transition hover:shadow-md ${
        isSelected ? 'border-gold' : 'border-border hover:border-ink-faint/40'
      }`}
    >
      <div className="relative h-[150px] w-full shrink-0">
        <SceneThumbnail scene={scene} className="h-full w-full rounded-none" showBadge={false} />

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
              className="flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-[10.5px] font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              <Icon name="image" size={11} />
              {scene.image ? 'Replace' : 'Add Image'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onGenerateClick()
              }}
              title="Open this scene's Visual field to prompt and generate an AI still"
              aria-label="Open this scene's Visual field to prompt and generate an AI still"
              className="flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-[10.5px] font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              <Icon name="wand-2" size={11} />
              Generate
            </button>
          </div>
          {scene.image && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onImageChange(null)
              }}
              className="flex h-5 w-5 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
              title="Remove image"
              aria-label="Remove image"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      <div className="flex items-start justify-between px-3.5 pt-3">
        {confirmingDelete ? (
          <>
            <span className="text-[11.5px] font-medium text-red-400">Delete this scene?</span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmingDelete(false)
                }}
                className="rounded p-0.5 text-ink-faint hover:text-ink"
                title="Cancel"
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="rounded p-0.5 text-red-400 hover:text-red-300"
                title="Confirm delete"
                aria-label="Confirm delete"
              >
                <Check size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span
                className="flex h-5 w-5 items-center justify-center rounded text-[10.5px] font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {scene.index}
              </span>
              <span className="text-[11.5px] font-medium" style={{ color }}>
                {scene.purpose}
              </span>
            </div>
            <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              <button
                {...attributes}
                {...listeners}
                onClick={(e) => e.stopPropagation()}
                className="cursor-grab rounded p-0.5 text-ink-faint active:cursor-grabbing"
              >
                <GripVertical size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmingDelete(true)
                }}
                className="rounded p-0.5 text-ink-faint hover:text-red-400"
                title="Delete scene"
                aria-label="Delete scene"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      <p className="line-clamp-2 px-3.5 pt-2 text-[12px] leading-snug whitespace-pre-line text-ink-dim">
        {scene.dialogue || <span className="text-ink-faint italic">No dialogue yet</span>}
      </p>

      <div className="mt-auto flex items-center justify-between px-3.5 py-3 text-[10.5px] text-ink-faint">
        <span>
          0:{String(scene.start).padStart(2, '0')}–0:{String(scene.end).padStart(2, '0')}
        </span>
        <span>{scene.end - scene.start}s</span>
      </div>
    </div>
  )
}
