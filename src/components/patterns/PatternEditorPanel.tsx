import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppStore } from '../../store/appStore'
import type { Pattern, PatternBeat, PatternCategory } from '../../lib/types'
import { PATTERN_CATEGORY_OPTIONS, PURPOSE_COLOR, PURPOSE_OPTIONS } from '../../lib/types'
import { ChevronDown, GripVertical, Plus, X } from '../../components/Icon'

let localBeatCounter = 0
function newBeatId() {
  localBeatCounter += 1
  return `newbeat-${Date.now()}-${localBeatCounter}`
}

function BeatRow({
  beat,
  onChange,
  onRemove,
  removable,
}: {
  beat: PatternBeat
  onChange: (patch: Partial<PatternBeat>) => void
  onRemove: () => void
  removable: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: beat.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const color = PURPOSE_COLOR[beat.purpose] ?? '#d3a75c'

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-lg border border-border-soft bg-surface-2 p-2">
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab rounded p-0.5 text-ink-faint active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="relative shrink-0">
        <select
          value={beat.purpose}
          onChange={(e) => onChange({ purpose: e.target.value as PatternBeat['purpose'] })}
          className="w-[118px] appearance-none rounded-md border border-border bg-surface py-1.5 pr-6 pl-2 text-[11.5px] text-ink focus:border-gold"
        >
          {PURPOSE_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <ChevronDown size={11} className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-ink-faint" />
      </div>
      <input
        value={beat.note}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="Creative note for this beat…"
        className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[11.5px] text-ink placeholder:text-ink-faint focus:border-gold"
      />
      <input
        type="number"
        min={0.2}
        step={0.1}
        value={beat.weight}
        onChange={(e) => onChange({ weight: Math.max(0.2, Number(e.target.value) || 0.2) })}
        title="Relative weight — how much of the total duration this beat takes"
        className="w-12 shrink-0 rounded-md border border-border bg-surface px-1.5 py-1.5 text-center text-[11.5px] text-ink focus:border-gold"
      />
      <button
        onClick={onRemove}
        disabled={!removable}
        className="shrink-0 rounded p-1 text-ink-faint transition hover:text-red-400 disabled:pointer-events-none disabled:opacity-30"
        title="Remove beat"
        aria-label="Remove beat"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export function PatternEditorPanel({
  pattern,
  onClose,
  onSaved,
}: {
  pattern?: Pattern
  onClose: () => void
  onSaved: (pattern: Pattern) => void
}) {
  const createPattern = useAppStore((s) => s.createPattern)
  const updatePattern = useAppStore((s) => s.updatePattern)

  const [name, setName] = useState(pattern?.name ?? '')
  const [description, setDescription] = useState(pattern?.description ?? '')
  const [category, setCategory] = useState<PatternCategory>(pattern?.category ?? PATTERN_CATEGORY_OPTIONS[0])
  const [estDurationSeconds, setEstDurationSeconds] = useState(pattern?.estDurationSeconds ?? 30)
  const [beats, setBeats] = useState<PatternBeat[]>(
    pattern?.beats ?? [{ id: newBeatId(), purpose: 'Hook', note: '', weight: 1 }],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = beats.map((b) => b.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    const reordered = [...beats]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    setBeats(reordered)
  }

  function addBeat() {
    setBeats([...beats, { id: newBeatId(), purpose: 'Example', note: '', weight: 1 }])
  }

  function updateBeat(id: string, patch: Partial<PatternBeat>) {
    setBeats(beats.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function removeBeat(id: string) {
    setBeats(beats.filter((b) => b.id !== id))
  }

  const canSave = name.trim().length > 0 && beats.length > 0

  function handleSave() {
    if (!canSave) return
    if (pattern) {
      updatePattern(pattern.id, { name: name.trim(), description, category, estDurationSeconds, beats })
      onSaved({ ...pattern, name: name.trim(), description, category, estDurationSeconds, beats })
    } else {
      const created = createPattern({
        name: name.trim(),
        description,
        category,
        estDurationSeconds,
        beats: beats.map(({ purpose, note, weight }) => ({ purpose, note, weight })),
      })
      onSaved(created)
    }
  }

  return (
    <motion.div
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full w-[420px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border-soft px-5 py-4">
        <h2 className="font-display text-[18px] text-ink">{pattern ? 'Edit Pattern' : 'New Pattern'}</h2>
        <button onClick={onClose} className="rounded-lg p-2 text-ink-faint transition hover:bg-surface-2 hover:text-ink">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div>
          <div className="mb-1.5 text-[11.5px] font-medium text-ink-dim">Name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hook → Payoff Loop"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-gold"
          />
        </div>

        <div>
          <div className="mb-1.5 text-[11.5px] font-medium text-ink-dim">Description</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What kind of story is this structure built for?"
            className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-gold"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1.5 text-[11.5px] font-medium text-ink-dim">Category</div>
            <div className="relative">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PatternCategory)}
                className="w-full appearance-none rounded-lg border border-border bg-surface-2 px-3 py-2 pr-8 text-[13px] text-ink focus:border-gold"
              >
                {PATTERN_CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint" />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11.5px] font-medium text-ink-dim">Target duration (s)</div>
            <input
              type="number"
              min={5}
              value={estDurationSeconds}
              onChange={(e) => setEstDurationSeconds(Math.max(5, Number(e.target.value) || 5))}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink focus:border-gold"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Beats</span>
            <button
              onClick={addBeat}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-ink-dim transition hover:border-gold hover:text-gold"
            >
              <Plus size={11} />
              Add Beat
            </button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={beats.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {beats.map((beat) => (
                  <BeatRow
                    key={beat.id}
                    beat={beat}
                    onChange={(patch) => updateBeat(beat.id, patch)}
                    onRemove={() => removeBeat(beat.id)}
                    removable={beats.length > 1}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border-soft px-5 py-4">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg border border-border px-3 py-2.5 text-[12.5px] font-medium text-ink-dim transition hover:border-ink-faint hover:text-ink"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 rounded-lg bg-gold px-3 py-2.5 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-50"
        >
          {pattern ? 'Save Changes' : 'Create Pattern'}
        </button>
      </div>
    </motion.div>
  )
}
