import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, Pause, Play, Redo2, Scissors, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useEditStore } from '../store/editStore'
import { TimelineHeader } from '../components/timeline/TimelineHeader'
import { EditorPreview } from '../components/editor/EditorPreview'
import { EditorTimeline, type Selection } from '../components/editor/EditorTimeline'
import { EditorLibrary } from '../components/editor/EditorLibrary'
import { EditorInspector } from '../components/editor/EditorInspector'
import { EditorInsights } from '../components/editor/EditorInsights'
import { ExportDialog } from '../components/editor/ExportDialog'
import {
  addClip,
  addSource,
  layout,
  removeClip,
  removeText,
  setTransition,
  splitAt,
  totalDuration,
  withText,
  type EditProject,
  type FontComboId,
  type TextAnimationId,
  type TransitionId,
} from '../lib/editor/model'
import { textsFromScript, transitionPreset } from '../lib/editor/presets'
import { analyzeEdit } from '../lib/editor/insights'
import { ensureEditorFonts } from '../lib/editor/render'
import { importMedia, sourceUrl } from '../lib/editor/media'
import { toast } from '../lib/toast'

/**
 * The editor: footage, looks and transitions on the left, the picture in the
 * middle, properties and insights on the right, and the cut along the bottom.
 *
 * It edits one episode, and the plan is never far away — the script lane runs
 * above the picture, the script's on-screen lines can be dropped in at their
 * beats, and the insights judge the cut against the creator's own results.
 */

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)

const clock = (t: number) => {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

export function EditorView() {
  const { projectId, episodeId } = useParams()
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const episode = useAppStore((s) => s.episodes.find((e) => e.id === episodeId))

  const edit = useEditStore((s) => (episodeId ? s.edits[episodeId] : undefined))
  const ensure = useEditStore((s) => s.ensure)
  const commitRaw = useEditStore((s) => s.commit)
  const undo = useEditStore((s) => s.undo)
  const redo = useEditStore((s) => s.redo)
  const history = useEditStore((s) => (episodeId ? s.history[episodeId] : undefined))

  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selection, setSelection] = useState<Selection>(null)
  const [pxPerSec, setPxPerSec] = useState(70)
  const [urls, setUrls] = useState<Record<string, string | null>>({})
  const [importing, setImporting] = useState(false)
  const [panel, setPanel] = useState<'inspector' | 'insights'>('inspector')
  const [exporting, setExporting] = useState(false)
  const [, setFontsReady] = useState(false)

  useEffect(() => {
    if (episode && !edit) ensure(episode)
  }, [episode, edit, ensure])

  // Faces load once; the preview repaints when they arrive rather than drawing in a fallback.
  useEffect(() => {
    ensureEditorFonts().then(() => {
      setFontsReady(true)
      setTime((t) => t + 1e-9)
    })
  }, [])

  // Resolve every source to something the webview can load, whenever the bin changes.
  const sourceKey = edit?.sources.map((s) => `${s.id}:${s.path ?? s.url ?? ''}`).join('|') ?? ''
  useEffect(() => {
    if (!edit) return
    let cancelled = false
    Promise.all(edit.sources.map(async (s) => [s.id, await sourceUrl(s)] as const)).then((pairs) => {
      if (!cancelled) setUrls(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey])

  const placed = useMemo(() => (edit ? layout(edit.clips) : []), [edit])
  const duration = edit ? totalDuration(edit) : 0
  const flags = useMemo(() => (edit ? analyzeEdit(edit, episode).filter((i) => i.severity === 'flag').length : 0), [edit, episode])

  // The cut got shorter under the playhead — keep it on the timeline.
  useEffect(() => {
    if (time > duration) setTime(duration)
  }, [time, duration])

  const commit = useCallback(
    (next: EditProject, options?: { coalesce?: boolean }) => commitRaw(next, options),
    [commitRaw],
  )

  const togglePlay = useCallback(() => {
    if (!edit || !edit.clips.length) return
    setPlaying((p) => {
      if (!p && time >= duration - 1e-3) setTime(0)
      return !p
    })
  }, [edit, time, duration])

  const split = useCallback(() => {
    if (!edit) return
    const next = splitAt(edit, time)
    if (next === edit) toast.error('Nothing to split there — the playhead is on a join, inside a transition, or too near an edge.')
    else commit(next)
  }, [edit, time, commit])

  const deleteSelection = useCallback(() => {
    if (!edit || !selection) return
    if (selection.kind === 'clip') commit(removeClip(edit, selection.id))
    else if (selection.kind === 'text') commit(removeText(edit, selection.id))
    else commit(setTransition(edit, selection.id, undefined))
    setSelection(null)
  }, [edit, selection, commit])

  // Captured, so ⌘Z here undoes the edit rather than falling through to the script's undo.
  useEffect(() => {
    if (!episodeId) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const meta = e.metaKey || e.ctrlKey
      const frame = 1 / (edit?.fps ?? 30)
      let handled = true
      if (meta && e.key.toLowerCase() === 'z') (e.shiftKey ? redo : undo)(episodeId)
      else if (meta) handled = false
      else if (e.key === ' ') togglePlay()
      else if (e.key.toLowerCase() === 's') split()
      else if (e.key === 'Backspace' || e.key === 'Delete') deleteSelection()
      else if (e.key === 'ArrowLeft') setTime((t) => Math.max(0, t - (e.shiftKey ? 1 : frame)))
      else if (e.key === 'ArrowRight') setTime((t) => Math.min(duration, t + (e.shiftKey ? 1 : frame)))
      else if (e.key === 'Escape') setSelection(null)
      else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [episodeId, edit, duration, togglePlay, split, deleteSelection, undo, redo])

  if (!project || !episode) {
    return (
      <div className="grid h-full place-items-center text-center">
        <div>
          <p className="text-[14px] text-ink-dim">That episode no longer exists.</p>
          <Link to="/projects" className="mt-2 inline-block text-[13px] text-gold hover:underline">
            Back to projects
          </Link>
        </div>
      </div>
    )
  }
  if (!edit) return null

  async function handleImport() {
    if (!edit) return
    setImporting(true)
    try {
      const { sources, failed } = await importMedia()
      let next = edit
      for (const s of sources) next = addSource(next, s)
      // The first import lays down a rough cut, in the order picked.
      if (!edit.clips.length) for (const s of sources) next = addClip(next, next.sources.find((x) => x.path && x.path === s.path)?.id ?? s.id)
      if (next !== edit) commit(next)
      if (failed.length) toast.error(`Couldn't read ${failed.map((f) => f.name).join(', ')}.`)
      else if (sources.length) toast.success(`Added ${sources.length} file${sources.length > 1 ? 's' : ''}.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  function addTextAt(style: FontComboId, animation: TextAnimationId) {
    if (!edit) return
    const id = crypto.randomUUID()
    commit(withText(edit, { id, text: 'Your *line* here', start: time, duration: 2.5, style, animation, position: 'bottom' }))
    setSelection({ kind: 'text', id })
    setPanel('inspector')
  }

  function addScriptText() {
    if (!edit) return
    const already = new Set(edit.texts.map((t) => t.sceneId).filter(Boolean))
    const fresh = textsFromScript(episode!).filter((t) => !already.has(t.sceneId))
    if (!fresh.length) return toast.success('The script’s lines are already on the timeline.')
    commit({ ...edit, texts: [...edit.texts, ...fresh], updatedAt: new Date().toISOString() })
    toast.success(`Added ${fresh.length} line${fresh.length > 1 ? 's' : ''} from the script.`)
  }

  const transitionClip =
    selection && (selection.kind === 'clip' || selection.kind === 'transition')
      ? edit.clips.findIndex((c) => c.id === selection.id)
      : -1
  const transitionTarget =
    transitionClip > 0
      ? { label: `clip ${transitionClip + 1}`, current: edit.clips[transitionClip].transition?.preset ?? ('cut' as TransitionId) }
      : null

  const scriptLines = episode.scenes.filter((s) => s.onScreenText?.text?.trim()).length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TimelineHeader project={project} episode={episode} />

      {/* Transport. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-4 py-2">
        <button
          onClick={togglePlay}
          disabled={!edit.clips.length}
          className="grid h-8 w-8 place-items-center rounded-full bg-gold text-[#141316] transition hover:bg-gold-bright disabled:opacity-40"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>
        <span className="font-mono text-[12px] tabular-nums text-ink">
          {clock(time)} <span className="text-ink-faint">/ {clock(duration)}</span>
        </span>
        <div className="mx-2 h-5 w-px bg-border" />
        <button onClick={split} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-ink-dim transition hover:bg-surface-2 hover:text-ink" title="Split at the playhead (S)">
          <Scissors size={13} /> Split
        </button>
        <button
          onClick={() => episodeId && undo(episodeId)}
          disabled={!history?.past.length}
          className="rounded-md p-1.5 text-ink-dim transition hover:bg-surface-2 hover:text-ink disabled:opacity-30"
          title="Undo (⌘Z)"
          aria-label="Undo"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={() => episodeId && redo(episodeId)}
          disabled={!history?.future.length}
          className="rounded-md p-1.5 text-ink-dim transition hover:bg-surface-2 hover:text-ink disabled:opacity-30"
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
        >
          <Redo2 size={14} />
        </button>
        <div className="ml-auto flex items-center gap-2">
          <ZoomOut size={13} className="text-ink-faint" />
          <input
            type="range"
            min={20}
            max={220}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(parseInt(e.target.value, 10))}
            className="w-28 accent-[var(--color-gold)]"
            aria-label="Timeline zoom"
          />
          <ZoomIn size={13} className="text-ink-faint" />
          <button
            onClick={() => {
              setPlaying(false)
              setExporting(true)
            }}
            disabled={!edit.clips.length}
            className="ml-2 flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-40"
          >
            <Download size={13} /> Render
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[260px] shrink-0 border-r border-border-soft bg-surface">
          <EditorLibrary
            sources={edit.sources}
            importing={importing}
            scriptLines={scriptLines}
            transitionTarget={transitionTarget}
            onImport={handleImport}
            onAppend={(id) => {
              const next = addClip(edit, id)
              commit(next)
              setSelection({ kind: 'clip', id: next.clips[next.clips.length - 1].id })
            }}
            onAddText={addTextAt}
            onAddScriptText={addScriptText}
            onTransition={(id) => {
              if (transitionClip <= 0) return
              const d = transitionPreset(id).defaultDuration
              commit(setTransition(edit, edit.clips[transitionClip].id, id === 'cut' ? undefined : { preset: id, duration: d }))
            }}
          />
        </aside>

        <main className="relative min-w-0 flex-1 bg-[#0b0b0d] p-5">
          {edit.clips.length ? (
            <EditorPreview
              project={edit}
              placed={placed}
              time={time}
              playing={playing}
              urls={urls}
              onTime={setTime}
              onEnd={() => {
                setPlaying(false)
                setTime(duration)
              }}
            />
          ) : (
            <div className="grid h-full place-items-center">
              <div className="max-w-[340px] text-center">
                <p className="font-display text-[20px] text-ink">Start with footage</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
                  Import your clips and they’ll be laid down in the order you pick them — a rough cut to shape. The script’s
                  beats run above the timeline so you can see where each one lands.
                </p>
                <button
                  onClick={handleImport}
                  className="mt-4 rounded-lg bg-gold px-4 py-2 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright"
                >
                  Import footage
                </button>
              </div>
            </div>
          )}
        </main>

        <aside className="flex w-[320px] shrink-0 flex-col border-l border-border-soft bg-surface">
          <div className="flex shrink-0 gap-0.5 border-b border-border-soft px-2 pt-2">
            {(['inspector', 'insights'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPanel(p)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[12px] font-medium capitalize transition ${
                  panel === p ? 'border-gold text-ink' : 'border-transparent text-ink-dim hover:text-ink'
                }`}
              >
                {p}
                {p === 'insights' && flags > 0 && (
                  <span className="rounded-full bg-[#c4494f] px-1.5 text-[9.5px] font-semibold text-white">{flags}</span>
                )}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {panel === 'inspector' ? (
              <EditorInspector
                project={edit}
                episode={episode}
                selection={selection}
                time={time}
                onCommit={commit}
                onSelect={setSelection}
                onSplit={split}
              />
            ) : (
              <EditorInsights project={edit} episode={episode} onCommit={(next) => commit(next)} onSeek={setTime} />
            )}
          </div>
        </aside>
      </div>

      <div className="h-[212px] shrink-0 border-t border-border-soft bg-surface">
        <EditorTimeline
          project={edit}
          placed={placed}
          episode={episode}
          time={time}
          pxPerSec={pxPerSec}
          selection={selection}
          onSelect={(s) => {
            setSelection(s)
            if (s) setPanel('inspector')
          }}
          onScrub={(t) => {
            setPlaying(false)
            setTime(t)
          }}
          onCommit={commit}
        />
      </div>

      {exporting && <ExportDialog project={edit} episode={episode} onClose={() => setExporting(false)} />}
    </div>
  )
}
