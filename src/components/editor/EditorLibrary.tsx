import { useState } from 'react'
import { Film, Image as ImageIcon, Loader2, Plus, ScrollText, Upload, Volume2, VolumeX } from 'lucide-react'
import { DEFAULT_ANIMATION, FONT_COMBOS, TEXT_ANIMATIONS, TRANSITIONS, type FontCombo } from '../../lib/editor/presets'
import type { EditSource, FontComboId, TextAnimationId, TransitionId } from '../../lib/editor/model'

/**
 * The left rail: footage, looks, and transitions.
 *
 * Looks are shown as specimens set in their own faces rather than as names,
 * because "Condensed poster" means nothing until you see it.
 */

type Tab = 'media' | 'text' | 'transitions'


const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)}s`)

function Specimen({ combo }: { combo: FontCombo }) {
  const word = (text: string, accent = false) => (
    <span
      style={{
        fontFamily: accent ? (combo.accent.family ?? combo.family) : combo.family,
        fontWeight: accent ? (combo.accent.weight ?? combo.weight) : combo.weight,
        fontStyle: (accent ? (combo.accent.italic ?? combo.italic) : combo.italic) ? 'italic' : 'normal',
        color: accent ? (combo.accent.fill ?? combo.fill) : combo.fill,
        WebkitTextStroke: combo.stroke ? `${Math.max(1, combo.stroke.width * 14)}px ${combo.stroke.color}` : undefined,
        paintOrder: 'stroke fill',
      }}
    >
      {combo.uppercase ? text.toUpperCase() : text}
    </span>
  )
  return (
    <span
      className="inline-block leading-tight"
      style={{
        fontSize: Math.max(11, Math.min(22, combo.size * 260)),
        letterSpacing: `${combo.tracking}em`,
        background: combo.box?.color,
        padding: combo.box ? '2px 8px' : undefined,
        borderRadius: combo.box ? 6 : undefined,
        textShadow: combo.shadow && !combo.box ? '0 1px 6px rgba(0,0,0,.6)' : undefined,
      }}
    >
      {word('Style ')}
      {word('it', true)}
    </span>
  )
}

interface Props {
  sources: EditSource[]
  importing: boolean
  scriptLines: number
  transitionTarget: { label: string; current: TransitionId } | null
  onImport: () => void
  onAppend: (sourceId: string) => void
  onAddText: (style: FontComboId, animation: TextAnimationId) => void
  onAddScriptText: () => void
  onTransition: (id: TransitionId) => void
}

export function EditorLibrary({
  sources, importing, scriptLines, transitionTarget,
  onImport, onAppend, onAddText, onAddScriptText, onTransition,
}: Props) {
  const [tab, setTab] = useState<Tab>('media')

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-0.5 border-b border-border-soft px-2 pt-2">
        {(['media', 'text', 'transitions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-2.5 py-2 text-[12px] font-medium capitalize transition ${
              tab === t ? 'border-gold text-ink' : 'border-transparent text-ink-dim hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'media' && (
          <>
            <button
              onClick={onImport}
              disabled={importing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-3 py-2 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-60"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {importing ? 'Reading files…' : 'Import footage'}
            </button>
            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-faint">
              Footage stays where it is on disk — nothing is copied. Click + to add a clip to the end of the cut.
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {sources.length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11.5px] text-ink-faint">
                  No footage yet.
                </p>
              )}
              {sources.map((s) => {
                const offline = !s.path && !s.url
                return (
                  <div key={s.id} className="group flex items-center gap-2 rounded-lg border border-border-soft bg-surface-2 px-2.5 py-2">
                    {s.kind === 'image' ? (
                      <ImageIcon size={15} className="shrink-0 text-ink-faint" />
                    ) : (
                      <Film size={15} className="shrink-0 text-ink-faint" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11.5px] text-ink" title={s.path ?? s.name}>
                        {s.name}
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[9.5px] text-ink-faint">
                        {s.kind === 'video' ? dur(s.duration) : 'still'} · {s.width}×{s.height}
                        {s.kind === 'video' && (s.hasAudio ? <Volume2 size={9} /> : <VolumeX size={9} />)}
                        {offline && <span className="text-[#c96a4a]">offline</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => onAppend(s.id)}
                      disabled={offline}
                      className="rounded-md p-1.5 text-ink-dim transition hover:bg-elevated hover:text-gold disabled:opacity-30"
                      title="Add to the end of the cut"
                      aria-label={`Add ${s.name} to the end of the cut`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {tab === 'text' && (
          <>
            {scriptLines > 0 && (
              <button
                onClick={onAddScriptText}
                className="mb-3 flex w-full items-center gap-2 rounded-lg border border-gold/40 bg-gold-soft px-3 py-2 text-left text-[12px] text-ink transition hover:border-gold"
              >
                <ScrollText size={14} className="shrink-0 text-gold" />
                <span>
                  Add the script’s {scriptLines} on-screen line{scriptLines > 1 ? 's' : ''}
                  <span className="block text-[10.5px] text-ink-faint">Placed at each beat, in the look the script asked for.</span>
                </span>
              </button>
            )}
            <p className="mb-2 text-[10.5px] leading-relaxed text-ink-faint">
              Click a look to add text at the playhead. Wrap a word in *asterisks* to give it the accent.
            </p>
            <div className="flex flex-col gap-1.5">
              {FONT_COMBOS.map((combo) => (
                <button
                  key={combo.id}
                  onClick={() => onAddText(combo.id, DEFAULT_ANIMATION[combo.id])}
                  className="flex flex-col items-start gap-1.5 rounded-lg border border-border-soft bg-[#1b1d22] px-3 py-2.5 text-left transition hover:border-gold/60"
                >
                  <Specimen combo={combo} />
                  <span className="text-[10.5px] text-ink-dim">
                    {combo.label}
                    <span className="text-ink-faint"> · {TEXT_ANIMATIONS.find((a) => a.id === DEFAULT_ANIMATION[combo.id])?.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'transitions' && (
          <>
            <p className="mb-2 text-[10.5px] leading-relaxed text-ink-faint">
              {transitionTarget
                ? `Sets how ${transitionTarget.label} arrives.`
                : 'Select a clip (or the diamond on a join) to set how it arrives. Most cuts should stay straight.'}
            </p>
            <div className="flex flex-col gap-1.5">
              {TRANSITIONS.map((t) => {
                const active = transitionTarget?.current === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => onTransition(t.id)}
                    disabled={!transitionTarget}
                    className={`rounded-lg border px-3 py-2 text-left transition disabled:opacity-40 ${
                      active ? 'border-gold bg-gold-soft' : 'border-border-soft bg-surface-2 hover:border-gold/50'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-medium text-ink">{t.label}</span>
                      <span className="font-mono text-[9.5px] text-ink-faint">{t.defaultDuration ? `${t.defaultDuration}s` : 'instant'}</span>
                    </div>
                    <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">{t.description}</div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
