import { useEffect, useMemo, useRef, useState } from 'react'
import { Diamond, Image as ImageIcon, Type } from 'lucide-react'
import {
  cutMarkers,
  moveClip,
  plannedMarkers,
  totalDuration,
  trimClip,
  updateText,
  type EditProject,
  type PlacedClip,
} from '../../lib/editor/model'
import { transitionPreset } from '../../lib/editor/presets'
import { PURPOSE_COLOR, type Episode } from '../../lib/types'

/**
 * The timeline: the script's beats above, the picture, then the words.
 *
 * The script lane shows each beat twice — faintly where it was planned, solidly
 * where it landed in the cut — so a beat that grew in the edit is visible at a
 * glance rather than discovered in the retention curve a week later.
 *
 * Drags commit as they go, coalesced into one undo step per gesture. Reordering
 * is the exception: the clip follows the pointer as a ghost and commits once, on
 * release, because shuffling the whole cut on every pixel of travel would be
 * both slow and disorienting.
 */

export type Selection =
  | { kind: 'clip'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'transition'; id: string }
  | null

const PAD = 14
const RULER = 24
const SCRIPT = 22
const VIDEO = 58
const TEXT_ROW = 26
/** Pixels within which a dragged edge snaps to a cut or the playhead. */
const SNAP_PX = 7

type Drag =
  | { kind: 'scrub' }
  | { kind: 'trim'; clipId: string; edge: 'in' | 'out'; x0: number; in0: number; out0: number; moved: boolean }
  | { kind: 'reorder'; clipId: string; x0: number; dx: number }
  | { kind: 'text-move'; textId: string; x0: number; start0: number; moved: boolean }
  | { kind: 'text-length'; textId: string; x0: number; duration0: number; moved: boolean }

interface Props {
  project: EditProject
  placed: PlacedClip[]
  episode: Episode
  time: number
  pxPerSec: number
  selection: Selection
  onSelect: (s: Selection) => void
  onScrub: (t: number) => void
  onCommit: (next: EditProject, options?: { coalesce?: boolean }) => void
}

const fmt = (t: number) => {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return m ? `${m}:${s.toFixed(0).padStart(2, '0')}` : `${s.toFixed(0)}s`
}

export function EditorTimeline({ project, placed, episode, time, pxPerSec, selection, onSelect, onScrub, onCommit }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [ghost, setGhost] = useState<{ clipId: string; dx: number } | null>(null)

  const duration = totalDuration(project)
  const span = Math.max(duration + 4, 12)
  const width = PAD * 2 + span * pxPerSec
  const x = (t: number) => PAD + t * pxPerSec

  const planned = useMemo(() => plannedMarkers(episode), [episode])
  const landed = useMemo(() => cutMarkers(project, episode), [project, episode])
  const sourceName = useMemo(() => new Map(project.sources.map((s) => [s.id, s])), [project.sources])
  const sceneById = useMemo(() => new Map(episode.scenes.map((s) => [s.id, s])), [episode.scenes])

  // Texts stacked into rows so overlapping captions never hide each other.
  const textRows = useMemo(() => {
    const rows: number[] = []
    const placement = new Map<string, number>()
    for (const t of [...project.texts].sort((a, b) => a.start - b.start)) {
      let row = rows.findIndex((end) => end <= t.start + 1e-6)
      if (row === -1) {
        row = rows.length
        rows.push(0)
      }
      rows[row] = t.start + t.duration
      placement.set(t.id, row)
    }
    return { placement, count: Math.max(2, rows.length) }
  }, [project.texts])

  const snapTargets = useMemo(() => [0, time, ...placed.flatMap((p) => [p.start, p.end])], [placed, time])
  const snap = (t: number) => {
    for (const target of snapTargets) if (Math.abs(target - t) * pxPerSec < SNAP_PX) return target
    return t
  }

  const timeAt = (clientX: number) => {
    const el = scroller.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left + el.scrollLeft - PAD) / pxPerSec)
  }

  // One set of window listeners serves every kind of drag.
  const live = useRef({ project, placed, pxPerSec, onCommit, onScrub })
  live.current = { project, placed, pxPerSec, onCommit, onScrub }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const { project: p, pxPerSec: pps, onCommit: commit, onScrub: scrub } = live.current
      if (d.kind === 'scrub') return scrub(Math.min(timeAt(e.clientX), totalDuration(p)))
      const dt = (e.clientX - d.x0) / pps
      if (d.kind === 'reorder') {
        d.dx = e.clientX - d.x0
        setGhost({ clipId: d.clipId, dx: d.dx })
        return
      }
      if (d.kind === 'trim') {
        const next = trimClip(p, d.clipId, d.edge, (d.edge === 'in' ? d.in0 : d.out0) + dt)
        commit(next, { coalesce: d.moved })
        d.moved = true
        return
      }
      if (d.kind === 'text-move') {
        commit(updateText(p, d.textId, { start: snap(Math.max(0, d.start0 + dt)) }), { coalesce: d.moved })
        d.moved = true
        return
      }
      if (d.kind === 'text-length') {
        const text = p.texts.find((t) => t.id === d.textId)
        if (!text) return
        const end = snap(text.start + d.duration0 + dt)
        commit(updateText(p, d.textId, { duration: end - text.start }), { coalesce: d.moved })
        d.moved = true
      }
    }
    const up = (e: PointerEvent) => {
      const d = drag.current
      drag.current = null
      if (d?.kind === 'reorder') {
        setGhost(null)
        if (Math.abs(d.dx) > 4) {
          const { project: p, placed: pl, onCommit: commit } = live.current
          const t = timeAt(e.clientX)
          const others = pl.filter((c) => c.clip.id !== d.clipId)
          const index = others.filter((c) => (c.start + c.end) / 2 < t).length
          commit(moveClip(p, d.clipId, index))
        }
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const px = x(time)
    if (px < el.scrollLeft + 40 || px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = px - el.clientWidth / 3
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time])

  const ticks = useMemo(() => {
    const step = pxPerSec >= 90 ? 1 : pxPerSec >= 40 ? 2 : 5
    return Array.from({ length: Math.ceil(span / step) + 1 }, (_, i) => i * step)
  }, [pxPerSec, span])

  const textTop = RULER + SCRIPT + VIDEO + 10
  const height = textTop + textRows.count * TEXT_ROW + 12

  return (
    <div ref={scroller} className="relative h-full overflow-x-auto overflow-y-hidden select-none" onPointerDown={() => onSelect(null)}>
      <div className="relative" style={{ width, height }}>
        {/* Ruler — press anywhere on it to scrub. */}
        <div
          className="absolute inset-x-0 top-0 cursor-ew-resize border-b border-border-soft bg-surface-2/60"
          style={{ height: RULER }}
          onPointerDown={(e) => {
            e.stopPropagation()
            drag.current = { kind: 'scrub' }
            onScrub(Math.min(timeAt(e.clientX), duration))
          }}
        >
          {ticks.map((t) => (
            <div key={t} className="absolute top-0 h-full" style={{ left: x(t) }}>
              <div className="h-2 w-px bg-ink-faint/50" />
              <span className="absolute left-1 top-[7px] font-mono text-[9.5px] text-ink-faint">{fmt(t)}</span>
            </div>
          ))}
        </div>

        {/* Script: planned (faint) and landed (solid). */}
        <div className="absolute inset-x-0" style={{ top: RULER, height: SCRIPT }}>
          {planned.map((m) => (
            <div
              key={`p-${m.sceneId}`}
              className="absolute top-[4px] h-[5px] rounded-full opacity-30"
              style={{ left: x(m.start), width: Math.max(2, (m.end - m.start) * pxPerSec - 2), background: PURPOSE_COLOR[m.purpose] }}
              title={`${m.purpose} — planned ${m.start.toFixed(1)}–${m.end.toFixed(1)}s`}
            />
          ))}
          {landed.map((m) => (
            <div
              key={`l-${m.sceneId}`}
              className="absolute top-[11px] flex h-[8px] items-center rounded-full"
              style={{ left: x(m.start), width: Math.max(2, (m.end - m.start) * pxPerSec - 2), background: PURPOSE_COLOR[m.purpose] }}
              title={`${m.purpose} — in the cut ${m.start.toFixed(1)}–${m.end.toFixed(1)}s`}
            />
          ))}
        </div>

        {/* Picture. */}
        {placed.map((p) => {
          const source = sourceName.get(p.clip.sourceId)
          const scene = p.clip.sceneId ? sceneById.get(p.clip.sceneId) : undefined
          const selected = selection?.kind === 'clip' && selection.id === p.clip.id
          const offline = !source || (!source.path && !source.url)
          const dx = ghost?.clipId === p.clip.id ? ghost.dx : 0
          return (
            <div
              key={p.clip.id}
              className={`absolute overflow-hidden rounded-md border text-left transition-shadow ${
                selected ? 'z-10 border-gold ring-2 ring-gold/40' : 'border-white/10'
              } ${ghost?.clipId === p.clip.id ? 'z-20 opacity-80 shadow-2xl' : ''}`}
              style={{
                top: RULER + SCRIPT + 4,
                height: VIDEO - 8,
                left: x(p.start) + dx,
                width: Math.max(6, (p.end - p.start) * pxPerSec - 1),
                background: offline ? 'repeating-linear-gradient(135deg,#3a2a2a 0 6px,#2a2222 6px 12px)' : '#2b3340',
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
                onSelect({ kind: 'clip', id: p.clip.id })
                drag.current = { kind: 'reorder', clipId: p.clip.id, x0: e.clientX, dx: 0 }
              }}
            >
              {scene && <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: PURPOSE_COLOR[scene.purpose] }} />}
              <div className="flex h-full flex-col justify-center px-2.5 pt-[3px]">
                <span className="flex items-center gap-1 truncate text-[11px] font-medium text-ink">
                  {source?.kind === 'image' && <ImageIcon size={11} className="shrink-0 text-ink-dim" />}
                  <span className="truncate">{source?.name ?? 'Missing source'}</span>
                </span>
                <span className="truncate font-mono text-[9.5px] text-ink-faint">
                  {(p.end - p.start).toFixed(1)}s{scene ? ` · ${scene.purpose}` : ''}
                  {p.clip.zoom > 1.01 ? ` · ${Math.round(p.clip.zoom * 100)}%` : ''}
                  {offline ? ' · offline' : ''}
                </span>
              </div>
              {(['in', 'out'] as const).map((edge) => (
                <div
                  key={edge}
                  className={`absolute top-0 h-full w-[7px] cursor-ew-resize bg-white/0 hover:bg-gold/60 ${edge === 'in' ? 'left-0' : 'right-0'}`}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onSelect({ kind: 'clip', id: p.clip.id })
                    drag.current = { kind: 'trim', clipId: p.clip.id, edge, x0: e.clientX, in0: p.clip.in, out0: p.clip.out, moved: false }
                  }}
                />
              ))}
            </div>
          )
        })}

        {/* Transitions sit on the joins. */}
        {placed.slice(1).map((p) => {
          const preset = p.transition ? transitionPreset(p.transition.preset) : null
          const at = p.transition ? (p.transition.start + p.transition.end) / 2 : p.start
          const selected = selection?.kind === 'transition' && selection.id === p.clip.id
          return (
            <button
              key={`tr-${p.clip.id}`}
              className={`absolute z-20 flex h-[22px] -translate-x-1/2 items-center gap-1 rounded-full border px-1.5 text-[9.5px] font-medium shadow transition ${
                selected
                  ? 'border-gold bg-gold text-[#141316]'
                  : preset
                    ? 'border-gold/50 bg-surface text-gold'
                    : 'border-border bg-surface/90 text-ink-faint opacity-60 hover:opacity-100'
              }`}
              style={{ left: x(at), top: RULER + SCRIPT + VIDEO / 2 - 11 }}
              title={preset ? `${preset.label} — ${p.transition!.end - p.transition!.start < 0.01 ? '' : (p.transition!.end - p.transition!.start).toFixed(2) + 's'}` : 'Straight cut — click to add a transition'}
              onPointerDown={(e) => {
                e.stopPropagation()
                onSelect({ kind: 'transition', id: p.clip.id })
              }}
            >
              <Diamond size={10} />
              {preset && pxPerSec > 50 && <span>{preset.label}</span>}
            </button>
          )
        })}

        {/* Words. */}
        {project.texts.map((t) => {
          const row = textRows.placement.get(t.id) ?? 0
          const selected = selection?.kind === 'text' && selection.id === t.id
          return (
            <div
              key={t.id}
              className={`absolute flex cursor-grab items-center gap-1 overflow-hidden rounded border px-2 text-[10.5px] active:cursor-grabbing ${
                selected ? 'z-10 border-gold bg-[#4a3d25] text-ink ring-2 ring-gold/40' : 'border-[#8a7bd8]/40 bg-[#342f4d] text-ink-dim'
              }`}
              style={{ top: textTop + row * TEXT_ROW, height: TEXT_ROW - 5, left: x(t.start), width: Math.max(8, t.duration * pxPerSec - 1) }}
              onPointerDown={(e) => {
                e.stopPropagation()
                onSelect({ kind: 'text', id: t.id })
                drag.current = { kind: 'text-move', textId: t.id, x0: e.clientX, start0: t.start, moved: false }
              }}
            >
              <Type size={10} className="shrink-0 opacity-70" />
              <span className="truncate">{t.text.replace(/\*/g, '') || 'Empty text'}</span>
              <div
                className="absolute right-0 top-0 h-full w-[7px] cursor-ew-resize hover:bg-gold/60"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onSelect({ kind: 'text', id: t.id })
                  drag.current = { kind: 'text-length', textId: t.id, x0: e.clientX, duration0: t.duration, moved: false }
                }}
              />
            </div>
          )
        })}

        {/* Lane labels. */}
        <span className="pointer-events-none absolute left-1 text-[8.5px] font-semibold uppercase tracking-[1px] text-ink-faint/70" style={{ top: textTop - 11 }}>
          Text
        </span>

        {/* Playhead. */}
        <div className="pointer-events-none absolute top-0 z-30 w-px bg-[#ff5a4f]" style={{ left: x(time), height }}>
          <div className="absolute -left-[5px] -top-px h-[10px] w-[11px] rounded-b-sm bg-[#ff5a4f]" />
        </div>
      </div>
    </div>
  )
}
