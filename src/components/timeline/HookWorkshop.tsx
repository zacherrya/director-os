import { useState } from 'react'
import type { Episode, HookType, Scene } from '../../lib/types'
import { HOOK_TYPE_OPTIONS } from '../../lib/types'
import { useAppStore } from '../../store/appStore'
import { buildHistory } from '../../lib/draftCheck'
import { workshopHook, type HookCritique } from '../../lib/hookWorkshop'
import { ChevronDown, Loader2, Wand2 } from '../Icon'
import { toast } from '../../lib/toast'

function wordCount(s: string) {
  const t = s.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

export function HookWorkshop({
  scene,
  episode,
  onApply,
  onSetType,
}: {
  scene: Scene
  episode: Episode
  onApply: (line: string, type: HookType) => void
  onSetType: (type: HookType | undefined) => void
}) {
  const episodes = useAppStore((s) => s.episodes)
  const socialPosts = useAppStore((s) => s.socialPosts)
  const [result, setResult] = useState<HookCritique | null>(null)
  const [loading, setLoading] = useState(false)

  const words = wordCount(scene.dialogue)
  const hookSeconds = scene.end - scene.start
  // ~2.5 words/second is a normal delivery rate; the opening should clear 3s.
  const estimatedSeconds = words / 2.5

  async function run() {
    if (loading) return
    setLoading(true)
    try {
      const history = buildHistory(episodes, socialPosts)
      setResult(await workshopHook(scene, episode, history))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hook workshop failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-dim">
        <Wand2 size={12} />
        Hook workshop
      </div>
      <p className="mb-2.5 text-[11px] leading-relaxed text-ink-faint">
        The opening line decides how far this travels. Variants are written against your
        best-performing hooks where you've linked them.
      </p>

      <div className="mb-2.5 flex items-center gap-2 text-[11px]">
        <span className={estimatedSeconds > 3 ? 'text-[#c96a4a]' : 'text-ink-faint'}>
          {words} words ≈ {estimatedSeconds.toFixed(1)}s spoken
        </span>
        <span className="text-ink-faint">·</span>
        <span className="text-ink-faint">{hookSeconds}s allotted</span>
      </div>

      <div className="mb-2.5">
        <label className="mb-1 block text-[10.5px] tracking-wide text-ink-faint uppercase">Hook type</label>
        <div className="relative">
          <select
            value={scene.hookType ?? ''}
            onChange={(e) => onSetType(e.target.value === '' ? undefined : (e.target.value as HookType))}
            className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-surface px-2.5 py-1.5 pr-7 text-[12px] text-ink outline-none focus:border-gold"
          >
            <option value="">Not set</option>
            {HOOK_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-faint" />
        </div>
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[12px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-60"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
        {loading ? 'Writing…' : result ? 'Try again' : 'Suggest stronger hooks'}
      </button>

      {result && (
        <div className="mt-3 space-y-2">
          {result.critique && (
            <p className="rounded-md border-l-2 border-[#c96a4a]/60 bg-[#c96a4a]/5 py-1.5 pl-2 text-[11px] leading-relaxed text-ink-dim">
              {result.critique}
            </p>
          )}
          {result.variants.map((v, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-2.5">
              <p className="text-[12px] leading-relaxed text-ink">“{v.line}”</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="rounded bg-gold-soft px-1.5 py-px text-[9.5px] font-medium tracking-wide text-gold uppercase">
                    {v.type}
                  </span>
                  {v.why && <p className="mt-1 text-[10.5px] leading-relaxed text-ink-faint">{v.why}</p>}
                </div>
                <button
                  onClick={() => onApply(v.line, v.type)}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-ink-dim transition hover:border-gold hover:text-gold"
                >
                  Use
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
