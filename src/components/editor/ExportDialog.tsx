import { useRef, useState } from 'react'
import { Check, FolderOpen, Loader2, X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { ExportAborted, renderEdit, type ExportQuality } from '../../lib/editor/export'
import { chooseExportPath, isDesktop, sourceUrl, writeExport } from '../../lib/editor/media'
import { totalDuration, type EditProject } from '../../lib/editor/model'
import { revealCut } from '../../lib/projectFolder'
import type { Episode } from '../../lib/types'

/**
 * Rendering the cut.
 *
 * The save location is asked for first, not last: a render can take a minute,
 * and being asked where to put it only after waiting — or discovering that
 * Cancel on that dialog throws the render away — is the wrong way round.
 *
 * Once saved, the file can be attached as the episode's finished cut, which is
 * what the Post page uploads from. That is the whole point of rendering here:
 * the cut goes from the editor to Instagram without a trip through Finder.
 */

type Phase = { kind: 'idle' } | { kind: 'rendering'; fraction: number; label: string } | { kind: 'done'; path: string } | { kind: 'error'; message: string }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'edit'

export function ExportDialog({ project, episode, onClose }: { project: EditProject; episode: Episode; onClose: () => void }) {
  const updateEpisode = useAppStore((s) => s.updateEpisode)
  const [quality, setQuality] = useState<ExportQuality>('high')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [attached, setAttached] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const name = `${slug(episode.title)}-${new Date().toISOString().slice(0, 10)}.mp4`
  const seconds = totalDuration(project)

  async function start() {
    const dest = await chooseExportPath(name).catch((e: unknown) => {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      return null
    })
    if (dest === null) return
    const controller = new AbortController()
    abort.current = controller
    setPhase({ kind: 'rendering', fraction: 0, label: 'Starting…' })
    try {
      const bytes = await renderEdit(project, {
        quality,
        resolveUrl: sourceUrl,
        signal: controller.signal,
        onProgress: (p) => setPhase({ kind: 'rendering', fraction: p.fraction, label: p.label }),
      })
      setPhase({ kind: 'rendering', fraction: 1, label: 'Saving…' })
      const path = await writeExport(bytes, name)
      setPhase({ kind: 'done', path })
    } catch (err) {
      if (err instanceof ExportAborted) setPhase({ kind: 'idle' })
      else setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'The render failed.' })
    } finally {
      abort.current = null
    }
  }

  const rendering = phase.kind === 'rendering'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm" onPointerDown={() => !rendering && onClose()}>
      <div
        className="w-[420px] max-w-[92vw] rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[19px] text-ink">Render the cut</h2>
            <p className="mt-0.5 text-[12px] text-ink-dim">
              {project.width}×{project.height} · {project.fps}fps · {seconds.toFixed(1)}s · H.264 MP4
            </p>
          </div>
          {!rendering && (
            <button onClick={onClose} className="rounded-md p-1 text-ink-faint hover:text-ink" aria-label="Close">
              <X size={16} />
            </button>
          )}
        </div>

        {phase.kind === 'idle' || phase.kind === 'error' ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(['standard', 'high'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${
                    quality === q ? 'border-gold bg-gold-soft' : 'border-border hover:border-gold/50'
                  }`}
                >
                  <div className="text-[12.5px] font-medium capitalize text-ink">{q}</div>
                  <div className="text-[10.5px] text-ink-faint">{q === 'high' ? '16 Mbps — keeps detail through the platform re-encode' : '10 Mbps — smaller file'}</div>
                </button>
              ))}
            </div>
            {phase.kind === 'error' && (
              <p className="mt-3 rounded-lg border border-[#c4494f]/40 bg-[#c4494f]/10 px-3 py-2 text-[11.5px] text-[#e0787d]">{phase.message}</p>
            )}
            <button
              onClick={start}
              className="mt-4 w-full rounded-lg bg-gold px-3 py-2.5 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright"
            >
              {isDesktop() ? 'Choose where to save, then render' : 'Render and download'}
            </button>
            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-faint">
              Rendered on this Mac with its hardware encoder. Nothing is uploaded.
            </p>
          </>
        ) : phase.kind === 'rendering' ? (
          <div className="mt-5">
            <div className="flex items-center gap-2 text-[12px] text-ink-dim">
              <Loader2 size={13} className="animate-spin text-gold" />
              {phase.label}
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-gold transition-[width] duration-200" style={{ width: `${Math.round(phase.fraction * 100)}%` }} />
            </div>
            <button
              onClick={() => abort.current?.abort()}
              className="mt-4 rounded-lg border border-border px-3 py-1.5 text-[12px] text-ink-dim transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <div className="flex items-center gap-2 text-[13px] text-ink">
              <Check size={15} className="text-[#6bb15a]" /> Saved
            </div>
            <p className="mt-1 break-all font-mono text-[10.5px] text-ink-faint">{phase.path}</p>
            {isDesktop() && (
              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={() => {
                    updateEpisode(episode.id, { cutPath: phase.path })
                    setAttached(true)
                  }}
                  disabled={attached}
                  className="rounded-lg bg-gold px-3 py-2 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-60"
                >
                  {attached ? 'Attached — ready on the Post page' : 'Use as this episode’s finished cut'}
                </button>
                <button
                  onClick={() => revealCut(phase.path)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] text-ink-dim transition hover:text-ink"
                >
                  <FolderOpen size={13} /> Show in Finder
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
