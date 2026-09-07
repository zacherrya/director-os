import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { Episode, EpisodeStatus, Project, SpeakingPace } from '../../lib/types'
import { DEFAULT_SPEAKING_PACE, SPEAKING_PACE_OPTIONS } from '../../lib/types'
import { ChevronDown, Download, Gauge, Redo2, Share2, Undo2 } from '../Icon'
import { useAppStore } from '../../store/appStore'
import { exportEpisodeToPremiere } from '../../lib/premiereExport'
import { exportEpisodeScript } from '../../lib/scriptExport'
import { toast } from '../../lib/toast'

const EXPORT_TARGETS = [
  { id: 'premiere', label: 'Premiere Pro', enabled: true },
  { id: 'final-cut', label: 'Final Cut Pro', enabled: false },
  { id: 'resolve', label: 'DaVinci Resolve', enabled: false },
  { id: 'files', label: 'Export Files', enabled: true },
] as const

const statusOptions: EpisodeStatus[] = ['Planning', 'Filming', 'Editing', 'Ready', 'Published']
const statusColor: Record<EpisodeStatus, string> = {
  Planning: '#d3a75c',
  Filming: '#4f8fc0',
  Editing: '#8a7bd8',
  Ready: '#c9a227',
  Published: '#6bb15a',
}

function formatLength(seconds: number) {
  if (seconds < 60) return `${seconds} sec`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function TimelineHeader({ project, episode }: { project: Project; episode: Episode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const updateEpisode = useAppStore((s) => s.updateEpisode)
  const setEpisodeDefaultPace = useAppStore((s) => s.setEpisodeDefaultPace)
  const undo = useAppStore((s) => s.undo)
  const redo = useAppStore((s) => s.redo)
  const undoDepth = useAppStore((s) => s.undoDepth)
  const redoDepth = useAppStore((s) => s.redoDepth)
  const [exporting, setExporting] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const [sharingScript, setSharingScript] = useState(false)

  const isStoryboard = location.pathname.endsWith('/storyboard')
  const isPublish = location.pathname.endsWith('/publish')
  const isTimeline = !isStoryboard && !isPublish

  useEffect(() => {
    if (!exportMenuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [exportMenuOpen])

  async function handleShareScript() {
    if (sharingScript) return
    setSharingScript(true)
    try {
      await exportEpisodeScript(episode, project)
    } catch (err) {
      console.error('Script export failed', err)
      toast.error('Script export failed. Check the console for details.')
    } finally {
      setSharingScript(false)
    }
  }

  async function handleExport() {
    setExportMenuOpen(false)
    if (exporting) return
    setExporting(true)
    try {
      await exportEpisodeToPremiere(episode, project)
    } catch (err) {
      console.error('Export failed', err)
      toast.error('Export failed. Check the console for details.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="border-b border-border px-8 pt-6 pb-4">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-faint">
        <Link to="/projects" className="hover:text-ink-dim">
          Projects
        </Link>
        <span>/</span>
        <Link to={`/projects/${project.id}`} className="hover:text-ink-dim">
          {project.name}
        </Link>
        <span>/</span>
        <span className="text-ink-dim">Lesson {String(episode.number).padStart(3, '0')}</span>
      </div>

      {/* Wraps to a second row rather than pushing the actions off-screen — at the
          app's own 960px minimum width, Export used to sit 137px past the viewport
          with no scroll and no overflow menu, i.e. unreachable. */}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-[240px] flex-1">
          <input
            value={episode.title}
            title={episode.title}
            onChange={(e) => updateEpisode(episode.id, { title: e.target.value })}
            className="w-full max-w-[560px] bg-transparent font-display text-[26px] tracking-tight text-ink outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-dim">
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-ink-faint" />
              {formatLength(episode.length)}
            </span>
            <span>{episode.scenes.length} scenes</span>
            <span>{episode.format}</span>
            <div
              className="relative flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-ink-dim"
              title="Default speaking pace — sets scene duration from dialogue word count. Scenes can override this individually."
            >
              <Gauge size={11} />
              <select
                value={episode.defaultPace ?? DEFAULT_SPEAKING_PACE}
                onChange={(e) => setEpisodeDefaultPace(episode.id, e.target.value as SpeakingPace)}
                className="cursor-pointer appearance-none bg-transparent text-ink-dim outline-none"
              >
                {SPEAKING_PACE_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} ({p.wpm})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() =>
                updateEpisode(episode.id, {
                  status: statusOptions[(statusOptions.indexOf(episode.status) + 1) % statusOptions.length],
                })
              }
              className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition hover:brightness-110"
              style={{ backgroundColor: `${statusColor[episode.status]}20`, color: statusColor[episode.status] }}
              title="Click to advance status"
              aria-label="Click to advance status"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor[episode.status] }} />
              {episode.status}
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="mr-1 flex items-center rounded-lg border border-border p-0.5">
            <button
              onClick={() => navigate(`/projects/${project.id}/episodes/${episode.id}`)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
                isTimeline ? 'bg-elevated text-ink shadow-sm' : 'text-ink-dim hover:text-ink'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => navigate(`/projects/${project.id}/episodes/${episode.id}/storyboard`)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
                isStoryboard ? 'bg-elevated text-ink shadow-sm' : 'text-ink-dim hover:text-ink'
              }`}
            >
              Storyboard
            </button>
            <button
              onClick={() => navigate(`/projects/${project.id}/episodes/${episode.id}/publish`)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
                isPublish ? 'bg-elevated text-ink shadow-sm' : 'text-ink-dim hover:text-ink'
              }`}
            >
              Post
            </button>
          </div>
          <button
            onClick={undo}
            disabled={undoDepth === 0}
            className="rounded-lg p-2 text-ink-faint transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
            title={undoDepth === 0 ? 'Nothing to undo' : `Undo (Cmd+Z) — ${undoDepth} step${undoDepth === 1 ? '' : 's'}`}
            aria-label={undoDepth === 0 ? 'Nothing to undo' : `Undo, ${undoDepth} step${undoDepth === 1 ? '' : 's'} available`}
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={redo}
            disabled={redoDepth === 0}
            className="rounded-lg p-2 text-ink-faint transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
            title={redoDepth === 0 ? 'Nothing to redo' : `Redo (Cmd+Shift+Z) — ${redoDepth} step${redoDepth === 1 ? '' : 's'}`}
            aria-label={redoDepth === 0 ? 'Nothing to redo' : `Redo, ${redoDepth} step${redoDepth === 1 ? '' : 's'} available`}
          >
            <Redo2 size={16} />
          </button>
          <button
            onClick={handleShareScript}
            disabled={sharingScript}
            title="Download this episode's script as a PDF — cover, storyboard, and a detail page per scene"
            aria-label="Download this episode's script as a PDF — cover, storyboard, and a detail page per scene"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-ink-dim transition hover:border-ink-faint hover:text-ink disabled:opacity-50"
          >
            <Share2 size={14} />
            {sharingScript ? 'Preparing…' : 'Share Script'}
          </button>
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={exporting}
              title="Download this episode's blueprint — placeholder images, music, and SFX already placed on the timeline"
              aria-label="Download this episode's blueprint — placeholder images, music, and SFX already placed on the timeline"
              className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-50"
            >
              <Download size={14} />
              {exporting ? 'Exporting…' : 'Export'}
              <ChevronDown size={13} className={`transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportMenuOpen && (
              <div className="absolute top-full right-0 z-20 mt-1.5 w-48 overflow-hidden rounded-lg border border-border bg-elevated py-1 shadow-lg">
                {EXPORT_TARGETS.map((target) => (
                  <button
                    key={target.id}
                    onClick={target.enabled ? handleExport : undefined}
                    disabled={!target.enabled}
                    title={target.enabled ? undefined : 'Coming soon'}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] font-medium text-ink-dim transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent"
                  >
                    {target.label}
                    {!target.enabled && <span className="text-[10px] text-ink-faint">Soon</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export { statusOptions, statusColor }
