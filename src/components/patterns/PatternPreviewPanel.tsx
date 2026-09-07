import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import type { Pattern } from '../../lib/types'
import { PURPOSE_COLOR } from '../../lib/types'
import { Check, ChevronDown, Copy, Pencil, Star, Trash2, X, Zap } from '../../components/Icon'
import { PatternTimelineStrip } from './PatternTimelineStrip'

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function PatternPreviewPanel({
  pattern,
  onClose,
  onEdit,
}: {
  pattern: Pattern
  onClose: () => void
  onEdit: () => void
}) {
  const navigate = useNavigate()
  const projects = useAppStore((s) => s.projects)
  const toggleFavoritePattern = useAppStore((s) => s.toggleFavoritePattern)
  const duplicatePattern = useAppStore((s) => s.duplicatePattern)
  const deletePattern = useAppStore((s) => s.deletePattern)
  const applyPatternToNewEpisode = useAppStore((s) => s.applyPatternToNewEpisode)

  const [applying, setApplying] = useState(false)
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [title, setTitle] = useState(pattern.name)

  function handleDuplicate() {
    const copy = duplicatePattern(pattern.id)
    if (copy) onEdit()
  }

  function handleApply() {
    if (!projectId || !title.trim()) return
    const episode = applyPatternToNewEpisode(projectId, title.trim(), pattern.id)
    if (episode) navigate(`/projects/${projectId}/episodes/${episode.id}`)
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
        <div className="min-w-0">
          <div className="text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">{pattern.category}</div>
          <h2 className="truncate font-display text-[18px] text-ink">{pattern.name}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => toggleFavoritePattern(pattern.id)}
            className={`rounded-lg p-2 transition ${pattern.isFavorite ? 'text-gold' : 'text-ink-faint hover:text-gold'}`}
            title={pattern.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star size={16} fill={pattern.isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button onClick={onClose} className="rounded-lg p-2 text-ink-faint transition hover:bg-surface-2 hover:text-ink">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <PatternTimelineStrip beats={pattern.beats} height={44} showLabels />
        </div>

        <p className="text-[13px] leading-relaxed text-ink-dim">{pattern.description}</p>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border-soft bg-surface-2 p-4 text-[12px]">
          <div>
            <div className="text-ink-faint">Duration</div>
            <div className="mt-0.5 font-medium text-ink">{formatDuration(pattern.estDurationSeconds)}</div>
          </div>
          <div>
            <div className="text-ink-faint">Scenes</div>
            <div className="mt-0.5 font-medium text-ink">{pattern.beats.length}</div>
          </div>
          <div>
            <div className="text-ink-faint">Creator</div>
            <div className="mt-0.5 font-medium text-ink">{pattern.creator}</div>
          </div>
          <div>
            <div className="text-ink-faint">Used</div>
            <div className="mt-0.5 font-medium text-ink">{pattern.usageCount} times</div>
          </div>
        </div>

        <div>
          <div className="mb-2.5 text-[11px] font-medium tracking-wide text-ink-faint uppercase">Beats</div>
          <div className="space-y-2">
            {pattern.beats.map((beat, i) => {
              const color = PURPOSE_COLOR[beat.purpose] ?? '#d3a75c'
              return (
                <div key={beat.id} className="flex gap-3 rounded-lg border border-border-soft bg-surface-2 px-3 py-2.5">
                  <div
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium" style={{ color }}>
                      {beat.purpose}
                    </div>
                    {beat.note && <div className="mt-0.5 text-[11.5px] leading-snug text-ink-dim">{beat.note}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {applying && (
          <div className="space-y-3 rounded-xl border border-gold/30 bg-gold-soft p-4">
            <div className="text-[12px] font-medium text-ink">Apply "{pattern.name}" to a new episode</div>
            {projects.length === 0 ? (
              <p className="text-[12px] text-ink-dim">Create a project first, then come back to apply this pattern.</p>
            ) : (
              <>
                <div>
                  <div className="mb-1 text-[11px] text-ink-faint">Project</div>
                  <div className="relative">
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2 pr-8 text-[13px] text-ink focus:border-gold"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint" />
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] text-ink-faint">Episode title</div>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:border-gold"
                  />
                </div>
                <button
                  onClick={handleApply}
                  disabled={!title.trim()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2.5 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-50"
                >
                  <Check size={14} />
                  Create Episode
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border-soft px-5 py-4">
        <button
          onClick={() => setApplying((v) => !v)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2.5 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright"
        >
          <Zap size={14} />
          Apply to Project
        </button>
        <button
          onClick={handleDuplicate}
          title="Duplicate"
          aria-label="Duplicate"
          className="rounded-lg border border-border p-2.5 text-ink-dim transition hover:border-gold hover:text-gold"
        >
          <Copy size={15} />
        </button>
        <button
          onClick={onEdit}
          title="Edit"
          aria-label="Edit"
          className="rounded-lg border border-border p-2.5 text-ink-dim transition hover:border-gold hover:text-gold"
        >
          <Pencil size={15} />
        </button>
        {!pattern.isBuiltIn && (
          <button
            onClick={() => {
              deletePattern(pattern.id)
              onClose()
            }}
            title="Delete"
            aria-label="Delete"
            className="rounded-lg border border-border p-2.5 text-ink-dim transition hover:border-red-400 hover:text-red-400"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </motion.div>
  )
}
