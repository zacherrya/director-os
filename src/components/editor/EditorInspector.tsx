import { Scissors, Trash2 } from 'lucide-react'
import {
  clipLength,
  layout,
  removeClip,
  removeText,
  setTransition,
  totalDuration,
  transitionLength,
  trimClip,
  updateClip,
  updateText,
  type EditProject,
  type TextPosition,
} from '../../lib/editor/model'
import { FONT_COMBOS, TEXT_ANIMATIONS, TRANSITIONS, transitionPreset } from '../../lib/editor/presets'
import type { Episode } from '../../lib/types'
import type { Selection } from './EditorTimeline'

/**
 * Properties of whatever is selected. Every control commits through the same
 * pure operations the timeline uses, so a value typed here and a handle dragged
 * there can never disagree.
 */

const label = 'mb-1 block text-[9.5px] font-semibold uppercase tracking-[1.1px] text-ink-faint'
const field =
  'w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink outline-none transition focus:border-gold'

function Num({ value, onChange, step = 0.1, min, max, suffix }: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <div className="relative">
      <input
        type="number"
        value={Number(value.toFixed(2))}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onChange(v)
        }}
        className={`${field} pr-7 font-mono`}
      />
      {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] text-ink-faint">{suffix}</span>}
    </div>
  )
}

interface Props {
  project: EditProject
  episode: Episode
  selection: Selection
  time: number
  onCommit: (next: EditProject, options?: { coalesce?: boolean }) => void
  onSelect: (s: Selection) => void
  onSplit: () => void
}

export function EditorInspector({ project, episode, selection, time, onCommit, onSelect, onSplit }: Props) {
  const placed = layout(project.clips)

  if (!selection) {
    return (
      <div className="p-4">
        <div className={label}>This edit</div>
        <dl className="grid grid-cols-2 gap-y-1.5 text-[12px]">
          <dt className="text-ink-faint">Runtime</dt>
          <dd className="text-right font-mono text-ink">{totalDuration(project).toFixed(1)}s</dd>
          <dt className="text-ink-faint">Clips</dt>
          <dd className="text-right font-mono text-ink">{project.clips.length}</dd>
          <dt className="text-ink-faint">Text</dt>
          <dd className="text-right font-mono text-ink">{project.texts.length}</dd>
          <dt className="text-ink-faint">Frame</dt>
          <dd className="text-right font-mono text-ink">
            {project.width}×{project.height} · {project.fps}fps
          </dd>
        </dl>
        <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
          Space plays · S splits at the playhead · ⌫ deletes · ⌘Z undoes · ← → step a frame
        </p>
      </div>
    )
  }

  if (selection.kind === 'clip' || selection.kind === 'transition') {
    const index = project.clips.findIndex((c) => c.id === selection.id)
    const clip = project.clips[index]
    if (!clip) return null
    const source = project.sources.find((s) => s.id === clip.sourceId)
    const prev = project.clips[index - 1]
    const actual = transitionLength(prev, clip)
    const preset = clip.transition?.preset ?? 'cut'

    const transitionControls = (
      <div className="mb-4">
        <span className={label}>Arrives with</span>
        {index === 0 ? (
          <p className="text-[11px] text-ink-faint">The first clip has nothing to arrive from.</p>
        ) : (
          <>
            <select
              value={preset}
              onChange={(e) => {
                const id = e.target.value as typeof preset
                const d = transitionPreset(id).defaultDuration
                onCommit(setTransition(project, clip.id, id === 'cut' ? undefined : { preset: id, duration: d }))
              }}
              className={field}
            >
              {TRANSITIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            {preset !== 'cut' && (
              <div className="mt-2">
                <input
                  type="range"
                  min={0.1}
                  max={1.2}
                  step={0.02}
                  value={clip.transition?.duration ?? 0.3}
                  onChange={(e) =>
                    onCommit(setTransition(project, clip.id, { preset, duration: parseFloat(e.target.value) }), { coalesce: true })
                  }
                  className="w-full accent-[var(--color-gold)]"
                />
                <div className="flex justify-between font-mono text-[10px] text-ink-faint">
                  <span>{(clip.transition?.duration ?? 0).toFixed(2)}s asked</span>
                  {actual + 1e-6 < (clip.transition?.duration ?? 0) && <span className="text-gold">capped at {actual.toFixed(2)}s</span>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )

    if (selection.kind === 'transition') return <div className="p-4">{transitionControls}</div>

    return (
      <div className="p-4">
        <div className="mb-3 truncate text-[13px] font-medium text-ink" title={source?.path}>
          {source?.name ?? 'Missing source'}
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <span className={label}>In</span>
            <Num value={clip.in} suffix="s" onChange={(v) => onCommit(trimClip(project, clip.id, 'in', v))} />
          </div>
          <div>
            <span className={label}>Out</span>
            <Num value={clip.out} suffix="s" onChange={(v) => onCommit(trimClip(project, clip.id, 'out', v))} />
          </div>
        </div>
        <p className="-mt-1 mb-3 font-mono text-[10.5px] text-ink-faint">{clipLength(clip).toFixed(2)}s on the timeline</p>

        <div className="mb-4">
          <span className={label}>Script beat</span>
          <select
            value={clip.sceneId ?? ''}
            onChange={(e) => onCommit(updateClip(project, clip.id, { sceneId: e.target.value || undefined }))}
            className={field}
          >
            <option value="">Not tagged</option>
            {[...episode.scenes]
              .sort((a, b) => a.start - b.start)
              .map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {s.purpose}
                  {s.dialogue ? ` — ${s.dialogue.slice(0, 32)}` : ''}
                </option>
              ))}
          </select>
        </div>

        <div className="mb-4">
          <span className={label}>Framing · {Math.round(clip.zoom * 100)}%</span>
          <input
            type="range"
            min={1}
            max={1.4}
            step={0.01}
            value={clip.zoom}
            onChange={(e) => onCommit(updateClip(project, clip.id, { zoom: parseFloat(e.target.value) }), { coalesce: true })}
            className="w-full accent-[var(--color-gold)]"
          />
          <p className="mt-1 text-[10.5px] leading-snug text-ink-faint">110–120% on alternate cuts hides a jump cut.</p>
        </div>

        {source?.kind === 'video' && (
          <div className="mb-4">
            <span className={label}>Sound · {Math.round(clip.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clip.volume}
              disabled={!source.hasAudio}
              onChange={(e) => onCommit(updateClip(project, clip.id, { volume: parseFloat(e.target.value) }), { coalesce: true })}
              className="w-full accent-[var(--color-gold)] disabled:opacity-40"
            />
            {!source.hasAudio && <p className="text-[10.5px] text-ink-faint">This footage has no sound.</p>}
          </div>
        )}

        {transitionControls}

        <div className="flex gap-2">
          <button
            onClick={onSplit}
            disabled={!placed.some((p) => p.clip.id === clip.id && time > p.start && time < p.end)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11.5px] text-ink-dim transition hover:border-gold/60 hover:text-ink disabled:opacity-40"
          >
            <Scissors size={12} /> Split here
          </button>
          <button
            onClick={() => {
              onCommit(removeClip(project, clip.id))
              onSelect(null)
            }}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-ink-dim transition hover:border-[#c4494f]/60 hover:text-[#e0787d]"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
    )
  }

  const text = project.texts.find((t) => t.id === selection.id)
  if (!text) return null
  return (
    <div className="p-4">
      <span className={label}>Text</span>
      <textarea
        value={text.text}
        rows={3}
        onChange={(e) => onCommit(updateText(project, text.id, { text: e.target.value }), { coalesce: true })}
        className={`${field} resize-none leading-relaxed`}
        placeholder="Write the line. Wrap a word in *asterisks* for the accent."
      />
      <p className="mb-3 mt-1 text-[10.5px] text-ink-faint">*Asterisks* around a word give it the look’s accent.</p>

      <div className="mb-3">
        <span className={label}>Look</span>
        <select value={text.style} onChange={(e) => onCommit(updateText(project, text.id, { style: e.target.value as typeof text.style }))} className={field}>
          {FONT_COMBOS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <span className={label}>Animation</span>
        <select
          value={text.animation}
          onChange={(e) => onCommit(updateText(project, text.id, { animation: e.target.value as typeof text.animation }))}
          className={field}
        >
          {TEXT_ANIMATIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} — {a.description}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <span className={label}>Position</span>
        <div className="flex rounded-md border border-border p-0.5">
          {(['top', 'center', 'bottom'] as TextPosition[]).map((p) => (
            <button
              key={p}
              onClick={() => onCommit(updateText(project, text.id, { position: p }))}
              className={`flex-1 rounded px-2 py-1 text-[11.5px] capitalize transition ${
                text.position === p ? 'bg-elevated text-ink shadow-sm' : 'text-ink-dim hover:text-ink'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div>
          <span className={label}>Starts</span>
          <Num value={text.start} suffix="s" min={0} onChange={(v) => onCommit(updateText(project, text.id, { start: v }))} />
        </div>
        <div>
          <span className={label}>Lasts</span>
          <Num value={text.duration} suffix="s" min={0.5} onChange={(v) => onCommit(updateText(project, text.id, { duration: v }))} />
        </div>
      </div>

      <button
        onClick={() => {
          onCommit(removeText(project, text.id))
          onSelect(null)
        }}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-ink-dim transition hover:border-[#c4494f]/60 hover:text-[#e0787d]"
      >
        <Trash2 size={12} /> Delete text
      </button>
    </div>
  )
}
