import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppStore } from '../store/appStore'
import type { Pattern, PatternCategory } from '../lib/types'
import { PATTERN_CATEGORY_OPTIONS } from '../lib/types'
import { LayoutGrid, Plus, Search, Star } from '../components/Icon'
import { PatternCard } from '../components/patterns/PatternCard'
import { PatternPreviewPanel } from '../components/patterns/PatternPreviewPanel'
import { PatternEditorPanel } from '../components/patterns/PatternEditorPanel'
import { PatternScoreboard } from '../components/patterns/PatternScoreboard'

type CategoryFilter = 'all' | 'favorites' | PatternCategory
type PanelState = { mode: 'preview' | 'edit'; patternId: string | null } | null

function SortablePatternCard({
  pattern,
  onPreview,
  onToggleFavorite,
  onDuplicate,
  onEdit,
  onApply,
}: {
  pattern: Pattern
  onPreview: () => void
  onToggleFavorite: () => void
  onDuplicate: () => void
  onEdit: () => void
  onApply: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pattern.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <PatternCard
      pattern={pattern}
      draggable
      dragHandleProps={{ attributes, listeners }}
      nodeRef={setNodeRef}
      style={style}
      isDragging={isDragging}
      onPreview={onPreview}
      onToggleFavorite={onToggleFavorite}
      onDuplicate={onDuplicate}
      onEdit={onEdit}
      onApply={onApply}
    />
  )
}

export function PatternLibrary() {
  const patterns = useAppStore((s) => s.patterns)
  const toggleFavoritePattern = useAppStore((s) => s.toggleFavoritePattern)
  const duplicatePattern = useAppStore((s) => s.duplicatePattern)
  const reorderPatterns = useAppStore((s) => s.reorderPatterns)

  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [panel, setPanel] = useState<PanelState>(null)
  const [view, setView] = useState<'Library' | 'Scoreboard'>('Library')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const counts = useMemo(() => {
    const byCategory: Partial<Record<PatternCategory, number>> = {}
    let favorites = 0
    patterns.forEach((p) => {
      byCategory[p.category] = (byCategory[p.category] ?? 0) + 1
      if (p.isFavorite) favorites += 1
    })
    return { byCategory, favorites, all: patterns.length }
  }, [patterns])

  const filtered = useMemo(() => {
    let list = patterns
    if (categoryFilter === 'favorites') list = list.filter((p) => p.isFavorite)
    else if (categoryFilter !== 'all') list = list.filter((p) => p.category === categoryFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    }
    return list
  }, [patterns, categoryFilter, query])

  const isDefaultView = categoryFilter === 'all' && query.trim().length === 0
  const customPatterns = useMemo(
    () => filtered.filter((p) => !p.isBuiltIn).sort((a, b) => a.order - b.order),
    [filtered],
  )
  const builtInPatterns = useMemo(() => filtered.filter((p) => p.isBuiltIn), [filtered])
  const flatSorted = useMemo(
    () => [...filtered].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name)),
    [filtered],
  )

  const previewPattern = panel?.mode === 'preview' && panel.patternId ? patterns.find((p) => p.id === panel.patternId) : undefined
  const editingPattern = panel?.mode === 'edit' && panel.patternId ? patterns.find((p) => p.id === panel.patternId) : undefined

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = customPatterns.map((p) => p.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    const reordered = [...ids]
    reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, String(active.id))
    reorderPatterns(reordered)
  }

  function actionsFor(pattern: Pattern) {
    return {
      onPreview: () => setPanel({ mode: 'preview', patternId: pattern.id }),
      onToggleFavorite: () => toggleFavoritePattern(pattern.id),
      onDuplicate: () => {
        const copy = duplicatePattern(pattern.id)
        if (copy) setPanel({ mode: 'preview', patternId: copy.id })
      },
      onEdit: () => setPanel({ mode: 'edit', patternId: pattern.id }),
      onApply: () => setPanel({ mode: 'preview', patternId: pattern.id }),
    }
  }

  const categoryRailItem = (
    key: string,
    label: string,
    count: number,
    active: boolean,
    onClick: () => void,
    icon?: React.ReactNode,
  ) => (
    <button
      key={key}
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition ${
        active ? 'bg-gold-soft text-gold' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="text-[11px] text-ink-faint">{count}</span>
    </button>
  )

  return (
    <div className="flex h-full">
      <div className="hidden w-[220px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border-soft px-4 py-8 md:flex">
        <div className="mb-2 px-3 text-[11px] font-medium tracking-wide text-ink-faint uppercase">Library</div>
        {categoryRailItem('all', 'All Patterns', counts.all, categoryFilter === 'all', () => setCategoryFilter('all'), <LayoutGrid size={14} />)}
        {categoryRailItem(
          'favorites',
          'Favorites',
          counts.favorites,
          categoryFilter === 'favorites',
          () => setCategoryFilter('favorites'),
          <Star size={14} />,
        )}

        <div className="mt-5 mb-2 px-3 text-[11px] font-medium tracking-wide text-ink-faint uppercase">Categories</div>
        {PATTERN_CATEGORY_OPTIONS.map((c) =>
          categoryRailItem(c, c, counts.byCategory[c] ?? 0, categoryFilter === c, () => setCategoryFilter(c)),
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1180px] px-10 py-10">
          <div className="mb-7 flex items-start justify-between gap-6">
            <div>
              <h1 className="font-display text-[28px] text-ink">Pattern Library</h1>
              <p className="mt-1.5 text-[13.5px] text-ink-dim">
                Proven storytelling structures, not scripts. Save a shape once, reuse it forever.
              </p>
            </div>
            <button
              onClick={() => setPanel({ mode: 'edit', patternId: null })}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2.5 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright"
            >
              <Plus size={15} strokeWidth={2} />
              New Pattern
            </button>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-border p-0.5">
              {(['Library', 'Scoreboard'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
                    view === v ? 'bg-elevated text-ink shadow-sm' : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            {view === 'Library' && (
              <div className="flex max-w-[360px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                <Search size={15} className="text-ink-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search patterns..."
                  aria-label="Search patterns"
                  className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint"
                />
              </div>
            )}
          </div>

          {view === 'Scoreboard' && <PatternScoreboard />}

          {view === 'Library' && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-24 text-center">
              <p className="text-[13.5px] text-ink-dim">No patterns match that search.</p>
            </div>
          )}

          {view === 'Library' && (isDefaultView ? (
            <div className="space-y-10">
              {customPatterns.length > 0 && (
                <div>
                  <div className="mb-4 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
                    My Patterns · drag to reorder
                  </div>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={customPatterns.map((p) => p.id)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {customPatterns.map((p) => (
                          <SortablePatternCard key={p.id} pattern={p} {...actionsFor(p)} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              )}

              {builtInPatterns.length > 0 && (
                <div>
                  <div className="mb-4 text-[11px] font-medium tracking-wide text-ink-faint uppercase">Built-in Patterns</div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {builtInPatterns.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.03 }}
                      >
                        <PatternCard pattern={p} {...actionsFor(p)} />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {flatSorted.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.03 }}
                >
                  <PatternCard pattern={p} {...actionsFor(p)} />
                </motion.div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {previewPattern && (
          <PatternPreviewPanel
            key={previewPattern.id}
            pattern={previewPattern}
            onClose={() => setPanel(null)}
            onEdit={() => setPanel({ mode: 'edit', patternId: previewPattern.id })}
          />
        )}
        {panel?.mode === 'edit' && (
          <PatternEditorPanel
            key={editingPattern?.id ?? 'new'}
            pattern={editingPattern}
            onClose={() => setPanel(editingPattern ? { mode: 'preview', patternId: editingPattern.id } : null)}
            onSaved={(saved) => setPanel({ mode: 'preview', patternId: saved.id })}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
