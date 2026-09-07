import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { ChevronDown, ChevronRight, Copy, Icon, ListChecks, Plus, Trash2 } from '../components/Icon'
import { DeleteEpisodeModal } from '../components/DeleteEpisodeModal'
import { BatchProductionModal } from '../components/BatchProductionModal'
import { toast } from '../lib/toast'
import type { Episode, EpisodeStatus } from '../lib/types'

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

function lessonLabel(n: number) {
  return `Lesson ${String(n).padStart(3, '0')}`
}

function EpisodeCard({
  episode: ep,
  projectId,
  index,
  onDelete,
}: {
  episode: Episode
  projectId: string
  index: number
  onDelete: (ep: Episode) => void
}) {
  const navigate = useNavigate()
  const duplicateEpisode = useAppStore((s) => s.duplicateEpisode)
  const updateEpisode = useAppStore((s) => s.updateEpisode)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function pickStatus(status: EpisodeStatus) {
    setMenuOpen(false)
    if (status === ep.status) return
    updateEpisode(ep.id, { status })
    // Published cards leave this grid for the collapsed section at the bottom,
    // so say where it went rather than letting the card just vanish.
    if (status === 'Published') {
      toast.success(`${lessonLabel(ep.number)} moved into Published, at the bottom of this page.`)
    }
  }

  return (
    <motion.div
      onClick={() => navigate(`/projects/${projectId}/episodes/${ep.id}`)}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      // The card is transformed on hover, which makes it its own stacking
      // context — without lifting it, an open menu paints under later cards.
      style={{ zIndex: menuOpen ? 20 : undefined }}
      className="group relative flex cursor-pointer flex-col rounded-2xl border border-border bg-surface p-5 text-left shadow-sm transition hover:border-gold/40 hover:shadow-lg"
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
          {lessonLabel(ep.number)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              const copy = duplicateEpisode(ep.id)
              if (copy) navigate(`/projects/${projectId}/episodes/${copy.id}`)
            }}
            title="Duplicate episode"
            aria-label="Duplicate episode"
            className="rounded-md p-1 text-ink-faint opacity-0 transition hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
          >
            <Copy size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(ep)
            }}
            title="Delete episode"
            aria-label="Delete episode"
            className="rounded-md p-1 text-ink-faint opacity-0 transition hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>

          <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="Change status"
              aria-label={`Status: ${ep.status}. Change status`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium transition hover:brightness-110"
              style={{ backgroundColor: `${statusColor[ep.status]}20`, color: statusColor[ep.status] }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor[ep.status] }} />
              {ep.status}
              <ChevronDown size={11} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute top-full right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-lg border border-border bg-elevated py-1 shadow-lg"
              >
                {statusOptions.map((s) => (
                  <button
                    key={s}
                    role="menuitem"
                    onClick={() => pickStatus(s)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition hover:bg-surface-2 ${
                      s === ep.status ? 'font-semibold text-ink' : 'font-medium text-ink-dim hover:text-ink'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor[s] }} />
                    {s}
                    {s === 'Published' && ep.status !== 'Published' && (
                      <span className="ml-auto text-[10px] text-ink-faint">hides it</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <h3 className="font-display text-[17px] leading-snug text-ink">{ep.title}</h3>

      <div className="mt-4 flex items-center gap-4 text-[11.5px] text-ink-faint">
        <span>{formatLength(ep.length)}</span>
        <span>·</span>
        <span>{ep.scenes.length} scenes</span>
        <span>·</span>
        <span>{ep.format}</span>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-faint">
          <span>Completion</span>
          <span className="text-ink-dim">{ep.completion}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-soft">
          <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${ep.completion}%` }} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border-soft pt-3.5 text-[11.5px] text-ink-faint">
        <span>Shoot ~{ep.estShootMinutes}m · Edit ~{ep.estEditMinutes}m</span>
        <span className="text-ink-dim opacity-0 transition group-hover:opacity-100">Plan →</span>
      </div>
    </motion.div>
  )
}

export function ProjectEpisodes() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const allEpisodes = useAppStore((s) => s.episodes)
  const createEpisode = useAppStore((s) => s.createEpisode)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Episode | null>(null)
  const [showPublished, setShowPublished] = useState(false)
  const [batching, setBatching] = useState(false)

  const { active, published } = useMemo(() => {
    const mine = allEpisodes
      .filter((e) => e.projectId === projectId && !e.deletedAt)
      .sort((a, b) => a.number - b.number)
    return {
      active: mine.filter((e) => e.status !== 'Published'),
      published: mine.filter((e) => e.status === 'Published'),
    }
  }, [allEpisodes, projectId])

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-ink-dim">
        Project not found. <Link to="/projects" className="ml-2 text-gold">Back to Projects</Link>
      </div>
    )
  }

  function handleNewEpisode() {
    setCreating(true)
    const ep = createEpisode(project!.id, `Untitled Lesson ${active.length + published.length + 1}`)
    setCreating(false)
    navigate(`/projects/${project!.id}/episodes/${ep.id}`)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-10 py-10">
        <div className="mb-1.5 flex items-center gap-2 text-[12.5px] text-ink-faint">
          <Link to="/projects" className="hover:text-ink-dim">
            Projects
          </Link>
          <span>/</span>
          <span className="text-ink-dim">{project.name}</span>
        </div>

        <div className="mb-8 flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${project.color}22`, color: project.color }}
            >
              <Icon name={project.icon} size={22} />
            </div>
            <div>
              <h1 className="font-display text-[26px] tracking-tight text-ink">{project.name}</h1>
              <p className="text-[13px] text-ink-dim">{project.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBatching(true)}
              title="Name a run of episodes and create them all at once"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2.5 text-[13px] font-medium text-ink-dim transition hover:border-ink-faint hover:text-ink"
            >
              <ListChecks size={15} strokeWidth={1.75} />
              Batch Production
            </button>
            <button
              onClick={handleNewEpisode}
              disabled={creating}
              className="flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2.5 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright"
            >
              <Plus size={15} strokeWidth={2} />
              New Episode
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((ep, i) => (
            <EpisodeCard key={ep.id} episode={ep} projectId={project.id} index={i} onDelete={setDeleteTarget} />
          ))}
        </div>

        {/* Without this, marking the last one published leaves an empty page and
            no hint that the work is still here, folded up below. */}
        {active.length === 0 && published.length > 0 && (
          <p className="rounded-xl border border-border bg-surface px-4 py-3.5 text-[12.5px] text-ink-dim">
            Every lesson in this project is published.
          </p>
        )}

        {published.length > 0 && (
          <div className="mt-10 border-t border-border-soft pt-6">
            <button
              onClick={() => setShowPublished((v) => !v)}
              aria-expanded={showPublished}
              className="flex items-center gap-2 text-[12.5px] font-medium text-ink-dim transition hover:text-ink"
            >
              {showPublished ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Published
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-faint">
                {published.length}
              </span>
            </button>

            {showPublished && (
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {published.map((ep, i) => (
                  <EpisodeCard
                    key={ep.id}
                    episode={ep}
                    projectId={project.id}
                    index={i}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {deleteTarget && <DeleteEpisodeModal episode={deleteTarget} onClose={() => setDeleteTarget(null)} />}
      {batching && <BatchProductionModal projectId={project.id} onClose={() => setBatching(false)} />}
    </div>
  )
}
