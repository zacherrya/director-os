import { useState } from 'react'
import type { SceneSfxCue } from '../../lib/types'
import { SFX_CATEGORIES, SFX_LIBRARY, findSfx, playSfx, sfxDisplayLabel } from '../../lib/audioEngine'
import { Plus, Volume2, X } from '../Icon'

export function SfxPicker({
  selected,
  sceneDuration,
  onAdd,
  onRemove,
  onRemoveByName,
  onUpdate,
}: {
  selected: SceneSfxCue[]
  sceneDuration: number
  onAdd: (name: string) => void
  onRemove: (id: string) => void
  onRemoveByName: (name: string) => void
  onUpdate: (id: string, patch: Partial<SceneSfxCue>) => void
}) {
  const [showLibrary, setShowLibrary] = useState(false)
  const [category, setCategory] = useState<string>('Basic')
  const [query, setQuery] = useState('')

  const filtered = SFX_LIBRARY.filter((s) => {
    if (query.trim()) return s.label.toLowerCase().includes(query.trim().toLowerCase())
    return s.category === category
  })

  const selectedNames = new Set(selected.map((c) => c.name))

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-medium text-ink-dim">
        <span>SFX</span>
        <button onClick={() => setShowLibrary((v) => !v)} className="text-gold hover:text-gold-bright">
          {showLibrary ? 'Hide library' : `Browse library (${SFX_LIBRARY.length})`}
        </button>
      </div>

      {selected.length > 0 && (
        <div className="mb-2 space-y-1.5">
          <div className="flex items-center gap-1.5 px-1 text-[10px] text-ink-faint">
            <span className="min-w-0 flex-1">Sound</span>
            <span className="w-[52px] shrink-0 text-center">Starts at</span>
            <span className="w-[52px] shrink-0 text-center">Plays for</span>
            <span className="w-3 shrink-0" />
          </div>
          {selected.map((cue) => {
            const def = findSfx(cue.name)
            return (
              <div key={cue.id} className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5">
                <button
                  onClick={() => def && playSfx(cue.name, { duration: cue.duration })}
                  disabled={!def}
                  className="shrink-0 text-ink-faint transition hover:text-gold disabled:opacity-30"
                  title={def ? 'Preview' : undefined}
                >
                  <Volume2 size={12} />
                </button>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-dim" title={cue.name}>
                  {cue.name}
                </span>
                <div className="flex w-[52px] shrink-0 items-center justify-center gap-0.5">
                  <input
                    type="number"
                    min={0}
                    max={sceneDuration}
                    step={0.1}
                    value={cue.offset}
                    onChange={(e) =>
                      onUpdate(cue.id, {
                        offset: Math.max(0, Math.min(sceneDuration, Number(e.target.value) || 0)),
                      })
                    }
                    className="w-9 rounded border border-border bg-surface px-1 py-0.5 text-center text-[11px] text-ink"
                  />
                  <span className="text-[10px] text-ink-faint">s</span>
                </div>
                <div className="flex w-[52px] shrink-0 items-center justify-center gap-0.5">
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={cue.duration ?? ''}
                    placeholder="full"
                    onChange={(e) =>
                      onUpdate(cue.id, { duration: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                    className="w-9 rounded border border-border bg-surface px-1 py-0.5 text-center text-[11px] text-ink placeholder:text-ink-faint/60"
                  />
                  <span className="text-[10px] text-ink-faint">s</span>
                </div>
                <button
                  onClick={() => onRemove(cue.id)}
                  className="shrink-0 text-ink-faint hover:text-red-400"
                  title="Remove"
                  aria-label="Remove"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showLibrary && (
        <div className="mb-2 rounded-lg border border-border bg-surface-2 p-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all SFX…"
            className="mb-2 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[11.5px] text-ink placeholder:text-ink-faint focus:border-gold"
          />
          {!query.trim() && (
            <div className="mb-2 flex flex-wrap gap-1">
              {SFX_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                    category === c ? 'bg-gold-soft text-gold' : 'text-ink-faint hover:text-ink-dim'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto">
            {filtered.map((s) => {
              const displayLabel = sfxDisplayLabel(s)
              const added = selectedNames.has(displayLabel)
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-1 rounded-md px-1.5 py-1 text-[11px] text-ink-dim hover:bg-surface"
                >
                  <button
                    onClick={() => playSfx(s.id)}
                    className="flex min-w-0 flex-1 items-center gap-1 text-left hover:text-gold"
                    title="Preview"
                    aria-label="Preview"
                  >
                    <Volume2 size={11} className="shrink-0" />
                    <span className="truncate">{s.label}</span>
                  </button>
                  <button
                    onClick={() => (added ? onRemoveByName(displayLabel) : onAdd(displayLabel))}
                    className={`shrink-0 rounded p-0.5 ${added ? 'text-gold' : 'text-ink-faint hover:text-gold'}`}
                    title={added ? 'Remove from scene' : 'Add to scene'}
                  >
                    {added ? <X size={12} /> : <Plus size={12} />}
                  </button>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <span className="col-span-2 py-2 text-center text-[11px] text-ink-faint italic">No matches.</span>
            )}
          </div>
        </div>
      )}

      <SfxInput onAdd={onAdd} />
    </div>
  )
}

function SfxInput({ onAdd }: { onAdd: (v: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onAdd(value.trim())
            setValue('')
          }
        }}
        placeholder="Add SFX and press Enter"
        className="w-full bg-transparent text-[12.5px] text-ink placeholder:text-ink-faint"
      />
    </div>
  )
}
