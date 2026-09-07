import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore, nextEpisodeNumber } from '../store/appStore'
import { Plus, Trash2, X } from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'
import { toast } from '../lib/toast'
import type { Pattern } from '../lib/types'

/**
 * Planning a batch in one sitting: say how many episodes, name them, create them
 * all at once. A shoot day is planned this way — a run of lessons decided
 * together — and doing it through the New Episode button means opening and
 * abandoning the timeline once per episode.
 */

const MAX_BATCH = 50
const START_ROWS = 4

/** The beats a pattern lays down, in order, e.g. "Hook · Context · Payoff". */
function beatSummary(pattern: Pattern) {
  return pattern.beats.map((b) => b.purpose).join(' · ')
}

/** Blank rows are still real episodes; this is what they end up called. */
function fallbackTitle(number: number) {
  return `Untitled Lesson ${number}`
}

export function BatchProductionModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  useEscapeKey(onClose)

  const createEpisodes = useAppStore((s) => s.createEpisodes)
  const episodes = useAppStore((s) => s.episodes)
  const patterns = useAppStore((s) => s.patterns)
  const [titles, setTitles] = useState<string[]>(() => Array<string>(START_ROWS).fill(''))
  const [patternId, setPatternId] = useState('')
  const [focusRow, setFocusRow] = useState<number | null>(0)
  const rowRefs = useRef<(HTMLInputElement | null)[]>([])

  // The numbers these episodes will actually be given, so the list on screen is
  // the list that gets made rather than a guess at it.
  const startNumber = useMemo(() => nextEpisodeNumber(episodes, projectId), [episodes, projectId])

  // Built-ins keep their own order; a creator's own patterns follow the order
  // they arranged in the Templates page.
  const { builtIn, mine } = useMemo(
    () => ({
      builtIn: patterns.filter((p) => p.isBuiltIn),
      mine: [...patterns.filter((p) => !p.isBuiltIn)].sort((a, b) => a.order - b.order),
    }),
    [patterns],
  )
  const pattern = patterns.find((p) => p.id === patternId)

  const dirty = titles.some((t) => t.trim() !== '') || patternId !== ''

  useEffect(() => {
    if (focusRow === null) return
    rowRefs.current[focusRow]?.focus()
    setFocusRow(null)
  }, [focusRow])

  function setCount(next: number) {
    const n = Math.max(1, Math.min(MAX_BATCH, Math.round(next) || 1))
    setTitles((cur) => (n <= cur.length ? cur.slice(0, n) : [...cur, ...Array<string>(n - cur.length).fill('')]))
  }

  function setTitle(i: number, value: string) {
    setTitles((cur) => cur.map((t, j) => (j === i ? value : t)))
  }

  function insertAfter(i: number) {
    if (titles.length >= MAX_BATCH) return
    setTitles((cur) => [...cur.slice(0, i + 1), '', ...cur.slice(i + 1)])
    setFocusRow(i + 1)
  }

  function removeRow(i: number) {
    setTitles((cur) => (cur.length === 1 ? [''] : cur.filter((_, j) => j !== i)))
  }

  /** A pasted list of titles fills a row per line rather than landing as one long
   * title — this is where the names usually come from. */
  function handlePaste(i: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const lines = e.clipboardData
      .getData('text')
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
    if (lines.length < 2) return
    e.preventDefault()
    setTitles((cur) => {
      const next = [...cur.slice(0, i), ...lines, ...cur.slice(i + 1)]
      return next.slice(0, MAX_BATCH)
    })
  }

  function handleCreate() {
    const finalTitles = titles.map((t, i) => t.trim() || fallbackTitle(startNumber + i))
    createEpisodes(projectId, finalTitles, pattern?.id)
    onClose()
    const range =
      finalTitles.length === 1
        ? 'Created 1 episode'
        : `Created ${finalTitles.length} episodes, lessons ${String(startNumber).padStart(3, '0')}–${String(
            startNumber + finalTitles.length - 1,
          ).padStart(3, '0')}`
    toast.success(pattern ? `${range}, on ${pattern.name}.` : `${range}.`)
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Batch production"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        // A stray click outside must not throw away a dozen typed titles. Escape
        // and the two buttons still close it, so there is no way to get stuck.
        onClick={dirty ? undefined : onClose}
      >
        <motion.div
          className="flex max-h-[86vh] w-[min(560px,94vw)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between px-6 pt-6 pb-4">
            <div>
              <h2 className="font-display text-[19px] text-ink">Batch Production</h2>
              <p className="mt-0.5 text-[12px] text-ink-dim">
                Name a run of episodes and create them in one go.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center gap-3 border-y border-border-soft bg-surface-2/50 px-6 py-3">
            <label htmlFor="batch-count" className="text-[12px] font-medium text-ink-dim">
              How many episodes
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCount(titles.length - 1)}
                disabled={titles.length <= 1}
                aria-label="One fewer episode"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-ink-dim transition hover:border-ink-faint hover:text-ink disabled:opacity-30"
              >
                −
              </button>
              <input
                id="batch-count"
                type="number"
                min={1}
                max={MAX_BATCH}
                value={titles.length}
                onChange={(e) => setCount(Number(e.target.value))}
                className="h-7 w-14 rounded-md border border-border bg-surface px-2 text-center text-[13px] text-ink focus:border-gold"
              />
              <button
                onClick={() => setCount(titles.length + 1)}
                disabled={titles.length >= MAX_BATCH}
                aria-label="One more episode"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-ink-dim transition hover:border-ink-faint hover:text-ink disabled:opacity-30"
              >
                +
              </button>
            </div>
            <span className="ml-auto text-[11.5px] text-ink-faint">
              Paste a list to fill the names at once
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border-soft bg-surface-2/50 px-6 py-3">
            <label htmlFor="batch-pattern" className="text-[12px] font-medium text-ink-dim">
              Structure
            </label>
            <select
              id="batch-pattern"
              value={patternId}
              onChange={(e) => setPatternId(e.target.value)}
              className="max-w-[240px] cursor-pointer rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-gold"
            >
              <option value="">Blank — one empty scene</option>
              {builtIn.length > 0 && (
                <optgroup label="Built-in">
                  {builtIn.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {mine.length > 0 && (
                <optgroup label="Yours">
                  {mine.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {pattern ? (
              // The beats themselves, not just the name — this is what every
              // episode in the batch will open with.
              // basis-full drops this onto its own line: the beat list needs the
              // full width, and it is the part that says what you are choosing.
              <span className="basis-full truncate text-[11.5px] text-ink-faint" title={beatSummary(pattern)}>
                {beatSummary(pattern)} · {pattern.beats.length} scenes · ~{pattern.estDurationSeconds}s
              </span>
            ) : (
              <span className="basis-full text-[11.5px] text-ink-faint">
                Pick one and every episode starts with the same beats.
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-2">
              {titles.map((title, i) => (
                <div key={i} className="group/row flex items-center gap-2">
                  <span className="w-[88px] shrink-0 whitespace-nowrap text-[11px] font-medium tracking-wide text-ink-faint uppercase">
                    Lesson {String(startNumber + i).padStart(3, '0')}
                  </span>
                  <input
                    ref={(el) => {
                      rowRefs.current[i] = el
                    }}
                    value={title}
                    onChange={(e) => setTitle(i, e.target.value)}
                    onPaste={(e) => handlePaste(i, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        insertAfter(i)
                      }
                    }}
                    placeholder={fallbackTitle(startNumber + i)}
                    aria-label={`Title for lesson ${startNumber + i}`}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-gold"
                  />
                  <button
                    onClick={() => removeRow(i)}
                    disabled={titles.length === 1 && !title}
                    aria-label={`Remove lesson ${startNumber + i}`}
                    className="rounded-md p-1.5 text-ink-faint opacity-0 transition group-hover/row:opacity-100 hover:bg-red-400/10 hover:text-red-400 focus:opacity-100 disabled:opacity-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => insertAfter(titles.length - 1)}
              disabled={titles.length >= MAX_BATCH}
              className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-ink-dim transition hover:text-ink disabled:opacity-40"
            >
              <Plus size={13} />
              Add another
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border-soft px-6 py-4">
            <span className="text-[11.5px] text-ink-faint">
              Empty rows are still created, named as shown.
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-ink-dim hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="rounded-lg bg-gold px-4 py-2 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright"
              >
                Create {titles.length} {titles.length === 1 ? 'episode' : 'episodes'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
