import { motion } from 'framer-motion'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import type { Pattern } from '../../lib/types'
import { Copy, Eye, GripVertical, Pencil, Star, Zap } from '../../components/Icon'
import { PatternTimelineStrip } from './PatternTimelineStrip'

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const CATEGORY_TINT: Record<string, string> = {
  Educational: '#4f8fc0',
  Storytime: '#c77fb0',
  Listicle: '#4fa889',
  Transformation: '#8a7bd8',
  'Product Demo': '#c96a4a',
  'Myth Bust': '#c4494f',
  'Q&A': '#4fa8a0',
  'Behind the Scenes': '#d3a75c',
}

export function PatternCard({
  pattern,
  draggable,
  dragHandleProps,
  onPreview,
  onToggleFavorite,
  onDuplicate,
  onEdit,
  onApply,
  style,
  isDragging,
  nodeRef,
}: {
  pattern: Pattern
  draggable?: boolean
  dragHandleProps?: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners }
  onPreview: () => void
  onToggleFavorite: () => void
  onDuplicate: () => void
  onEdit: () => void
  onApply: () => void
  style?: React.CSSProperties
  isDragging?: boolean
  nodeRef?: (el: HTMLDivElement | null) => void
}) {
  const categoryColor = CATEGORY_TINT[pattern.category] ?? '#d3a75c'

  return (
    <motion.div
      ref={nodeRef}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={style}
      onClick={onPreview}
      className="group relative flex cursor-pointer flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-gold/40 hover:shadow-lg"
    >
      {draggable && (
        <button
          {...(dragHandleProps?.attributes ?? {})}
          {...(dragHandleProps?.listeners ?? {})}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3 left-3 z-10 cursor-grab rounded p-0.5 text-ink-faint opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavorite()
        }}
        className={`absolute top-3 right-3 z-10 rounded-full p-1.5 transition ${
          pattern.isFavorite
            ? 'text-gold opacity-100'
            : 'text-ink-faint opacity-0 hover:text-gold group-hover:opacity-100'
        }`}
        title={pattern.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star size={15} fill={pattern.isFavorite ? 'currentColor' : 'none'} />
      </button>

      <div className="mb-4">
        <PatternTimelineStrip beats={pattern.beats} height={32} />
      </div>

      <h3 className="font-display text-[16px] leading-tight text-ink">{pattern.name}</h3>
      <p className="mt-1.5 line-clamp-2 min-h-[32px] text-[12px] leading-relaxed text-ink-dim">
        {pattern.description}
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-border-soft pt-3 text-[11px] text-ink-faint">
        <span className="flex items-center gap-2.5">
          <span>{formatDuration(pattern.estDurationSeconds)}</span>
          <span>·</span>
          <span>{pattern.beats.length} scenes</span>
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: `${categoryColor}1f`, color: categoryColor }}
        >
          {pattern.category}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10.5px] text-ink-faint">
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gold/15 text-[8px] font-medium text-gold">
            {pattern.creator.slice(0, 1).toUpperCase()}
          </div>
          {pattern.creator}
        </div>
        {pattern.usageCount > 0 && (
          <span className="text-[10.5px] text-ink-faint">
            Used {pattern.usageCount}×
          </span>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 rounded-b-2xl bg-gradient-to-t from-surface via-surface/95 to-transparent pt-8 pb-3 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPreview()
          }}
          title="Preview"
          aria-label="Preview"
          className="flex items-center gap-1 rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-ink-dim transition hover:border-gold hover:text-gold"
        >
          <Eye size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
          title="Duplicate"
          aria-label="Duplicate"
          className="flex items-center gap-1 rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-ink-dim transition hover:border-gold hover:text-gold"
        >
          <Copy size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          title="Edit"
          aria-label="Edit"
          className="flex items-center gap-1 rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-ink-dim transition hover:border-gold hover:text-gold"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onApply()
          }}
          title="Apply to a new project"
          aria-label="Apply to a new project"
          className="flex items-center gap-1 rounded-lg bg-gold px-2.5 py-1.5 text-[11px] font-medium text-[#141316] transition hover:bg-gold-bright"
        >
          <Zap size={12} />
          Apply
        </button>
      </div>
    </motion.div>
  )
}
