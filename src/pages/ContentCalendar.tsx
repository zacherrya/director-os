import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useAppStore } from '../store/appStore'
import type { Episode, EpisodeStatus } from '../lib/types'
import { analyzePostingTime, describeSlot, type TimingReport } from '../lib/postingTime'
import { fileName, parentFolder, pickCut, revealCut } from '../lib/projectFolder'
import { toast } from '../lib/toast'
import { PLATFORM_LABEL, type SocialPlatform } from '../lib/social'
import { statusColor } from '../components/timeline/TimelineHeader'
import { Calendar, ChevronLeft, ChevronRight, Clock, Film, Icon, LayoutGrid } from '../components/Icon'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toDateKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfWeek(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function formatWeekRange(start: Date, end: Date) {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${startStr} – ${endStr}`
}

function formatLength(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

const EDITED_STATUSES: EpisodeStatus[] = ['Ready', 'Published']

/**
 * The two questions you actually ask when looking at a week: is it cut, and is
 * it out?
 *
 * Derived from `status` rather than stored separately — two booleans alongside a
 * status enum is three places for the same fact to disagree. Clicking a pip moves
 * the status, so the pipeline stays the single source of truth.
 */
function ProgressPips({ episode }: { episode: Episode }) {
  const updateEpisode = useAppStore((s) => s.updateEpisode)
  const edited = EDITED_STATUSES.includes(episode.status)
  const published = episode.status === 'Published'

  function set(status: EpisodeStatus, e: React.MouseEvent) {
    e.stopPropagation()
    updateEpisode(episode.id, { status })
  }

  const pip = (on: boolean, label: string, color: string, onClick: (e: React.MouseEvent) => void) => (
    <button
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      title={on ? `${label} — click to undo` : `Mark as ${label.toLowerCase()}`}
      aria-pressed={on}
      className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-medium whitespace-nowrap transition"
      style={
        on
          ? { backgroundColor: `${color}22`, color }
          : { color: 'var(--dos-ink-faint)', border: '1px solid var(--dos-border)' }
      }
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: on ? color : 'transparent', border: on ? undefined : '1px solid currentColor' }}
      />
      {label}
    </button>
  )

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {pip(edited, 'Edited', '#c9a227', (e) => set(edited ? 'Editing' : 'Ready', e))}
      {pip(published, 'Posted', '#6bb15a', (e) => set(published ? 'Ready' : 'Published', e))}
    </div>
  )
}

/**
 * The finished cut, attached to the episode it is a cut of.
 *
 * Attaching one also marks the episode Edited — a file existing on disk is the
 * thing "edited" was always standing in for, so making you assert it separately
 * is just a second chance to forget.
 */
function CutChip({ episode }: { episode: Episode }) {
  const updateEpisode = useAppStore((s) => s.updateEpisode)
  const updateProject = useAppStore((s) => s.updateProject)
  const projects = useAppStore((s) => s.projects)
  const [busy, setBusy] = useState(false)
  const cut = episode.cutPath

  async function attach(e: React.MouseEvent) {
    e.stopPropagation()
    setBusy(true)
    try {
      const startIn = projects.find((p) => p.id === episode.projectId)?.assetsFolder
      const picked = await pickCut(`Finished cut for "${episode.title}"`, startIn)
      if (picked) {
        updateEpisode(episode.id, {
          cutPath: picked,
          status: EDITED_STATUSES.includes(episode.status) ? episode.status : 'Ready',
        })
        // Remember where cuts for this project live, so the next pick starts there.
        updateProject(episode.projectId, { assetsFolder: parentFolder(picked) })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the file chooser.')
    } finally {
      setBusy(false)
    }
  }

  async function handleClick(e: React.MouseEvent) {
    if (!cut || e.altKey) return attach(e)
    e.stopPropagation()
    try {
      await revealCut(cut)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not find that file.')
    }
  }

  return (
    <button
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={busy}
      title={
        cut
          ? `${fileName(cut)} — click to show in Finder, ⌥-click to swap it`
          : 'Attach the finished cut for this episode'
      }
      aria-label={cut ? `Finished cut ${fileName(cut)}` : 'Attach the finished cut'}
      className="flex shrink-0 items-center justify-center rounded px-1.5 py-1 transition disabled:opacity-50"
      style={
        cut
          ? { backgroundColor: '#4f8fc022', color: '#4f8fc0' }
          : { color: 'var(--dos-ink-faint)', border: '1px solid var(--dos-border)' }
      }
    >
      <Film size={10} />
    </button>
  )
}

function EpisodeCard({
  episode,
  projectColor,
  projectIcon,
  projectName,
  dragging,
}: {
  episode: Episode
  projectColor: string
  projectIcon: string
  projectName: string
  dragging?: boolean
}) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: episode.id })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => navigate(`/projects/${episode.projectId}/episodes/${episode.id}`)}
      style={
        transform && !dragging
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 20 }
          : undefined
      }
      className={`cursor-grab rounded-lg border border-border bg-surface p-2.5 text-left shadow-sm transition active:cursor-grabbing hover:border-gold/40 ${
        isDragging && !dragging ? 'opacity-30' : ''
      } ${dragging ? 'rotate-2 shadow-xl' : ''}`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span
          className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded"
          style={{ backgroundColor: `${projectColor}22`, color: projectColor }}
        >
          <Icon name={projectIcon} size={10} />
        </span>
        <span className="truncate text-[10.5px] font-medium text-ink-faint">{projectName}</span>
      </div>
      <p className="line-clamp-2 text-[12px] leading-snug font-medium text-ink">{episode.title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-ink-faint">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor[episode.status] }} />
        <span>{episode.status}</span>
        <span>·</span>
        <span>{formatLength(episode.length)}</span>
        <span className="ml-auto">
          <CutChip episode={episode} />
        </span>
      </div>
      <ProgressPips episode={episode} />
    </div>
  )
}

/**
 * What the analytics pages know that changes what you do here: when to post, and
 * where the finished files are.
 *
 * Every platform with any history is listed, including the ones with nothing
 * useful to say. A card that silently disappears when the data is thin reads as
 * broken; one that says "no slot stands out yet" is doing its job.
 */
function PostingPlan({
  finds,
  onOpenAnalytics,
}: {
  finds: { platform: SocialPlatform; report: TimingReport }[]
  onOpenAnalytics: () => void
}) {
  if (finds.length === 0) return null

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface px-4 py-3">
      {finds.length > 0 && (
        <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
            <Clock size={12} className="text-gold" />
            Best time to post
          </span>

          {finds.map((f) => {
            const best = f.report.verdict === 'recommend' ? f.report.best : null
            return (
              <span key={f.platform} className="text-[12px] text-ink-dim">
                <span className="text-ink-faint">{PLATFORM_LABEL[f.platform]}</span>{' '}
                {best ? (
                  <>
                    <span className="font-medium text-ink">{describeSlot(best)}</span>{' '}
                    <span className="text-ink-faint">
                      (+{Math.round(best.lift * 100)}%{best.confident ? '' : ', early read'})
                    </span>
                  </>
                ) : (
                  <span className="text-ink-faint">
                    {f.report.verdict === 'insufficient'
                      ? 'not enough history yet'
                      : f.report.verdict === 'one-slot'
                        ? 'only ever posted in one slot'
                        : 'no slot stands out'}
                  </span>
                )}
              </span>
            )
          })}

          <button
            onClick={onOpenAnalytics}
            className="ml-auto shrink-0 text-[11px] text-ink-faint underline decoration-dotted transition hover:text-ink-dim"
          >
            See the breakdown →
          </button>
        </div>
      )}

    </div>
  )
}

function DayColumn({
  id,
  label,
  dayNumber,
  isToday,
  isBestDay,
  episodes,
  projectById,
}: {
  id: string
  label: string
  dayNumber: number
  isToday: boolean
  isBestDay: boolean
  episodes: Episode[]
  projectById: Map<string, { color: string; icon: string; name: string }>
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[420px] flex-col gap-2 rounded-xl border p-2.5 transition ${
        isOver
          ? 'border-gold bg-gold-soft'
          : isBestDay
            ? 'border-gold/30 bg-gold-soft/40'
            : 'border-border-soft bg-surface-2'
      }`}
    >
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1 text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">
          {label}
          {isBestDay && <Clock size={10} className="text-gold" />}
        </span>
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${
            isToday ? 'bg-gold text-[#141316]' : 'text-ink-dim'
          }`}
        >
          {dayNumber}
        </span>
      </div>
      {episodes.map((ep) => {
        const proj = projectById.get(ep.projectId)
        return (
          <EpisodeCard
            key={ep.id}
            episode={ep}
            projectColor={proj?.color ?? '#d3a75c'}
            projectIcon={proj?.icon ?? 'film'}
            projectName={proj?.name ?? ''}
          />
        )
      })}
    </div>
  )
}

export function ContentCalendar() {
  const allProjects = useAppStore((s) => s.projects)
  const allEpisodes = useAppStore((s) => s.episodes)
  const updateEpisode = useAppStore((s) => s.updateEpisode)
  const socialPosts = useAppStore((s) => s.socialPosts)
  const pageNavigate = useNavigate()
  const projects = useMemo(() => allProjects.filter((p) => !p.deletedAt), [allProjects])
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [activeId, setActiveId] = useState<string | null>(null)
  /** 'all' shows the combined plan across every project. */
  const [projectFilter, setProjectFilter] = useState<string>('all')

  const episodes = useMemo(() => {
    const activeProjectIds = new Set(projects.map((p) => p.id))
    return allEpisodes.filter(
      (ep) =>
        activeProjectIds.has(ep.projectId) &&
        !ep.deletedAt &&
        (projectFilter === 'all' || ep.projectId === projectFilter),
    )
  }, [allEpisodes, projects, projectFilter])

  // Counts come from the unfiltered set, so each button shows what you'd get.
  const countsByProject = useMemo(() => {
    const activeProjectIds = new Set(projects.map((p) => p.id))
    const live = allEpisodes.filter((ep) => activeProjectIds.has(ep.projectId) && !ep.deletedAt)
    const m = new Map<string, number>()
    live.forEach((ep) => m.set(ep.projectId, (m.get(ep.projectId) ?? 0) + 1))
    return { total: live.length, byProject: m }
  }, [allEpisodes, projects])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const projectById = useMemo(() => {
    const m = new Map<string, { color: string; icon: string; name: string }>()
    projects.forEach((p) => m.set(p.id, { color: p.color, icon: p.icon, name: p.name }))
    return m
  }, [projects])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const todayKey = toDateKey(new Date())

  const episodesByDate = useMemo(() => {
    const m = new Map<string, Episode[]>()
    episodes.forEach((ep) => {
      if (!ep.scheduledDate) return
      const list = m.get(ep.scheduledDate) ?? []
      list.push(ep)
      m.set(ep.scheduledDate, list)
    })
    return m
  }, [episodes])

  // Each platform is analysed on its own — interleaving two accounts would make
  // a post's "neighbours" come from a different audience at a different scale.
  const timingFinds = useMemo(
    () =>
      (['instagram', 'youtube'] as SocialPlatform[])
        .map((pf) => ({ platform: pf, report: analyzePostingTime(socialPosts.filter((p) => p.platform === pf)) }))
        // Platforms with no posts at all aren't worth a row; everything else is,
        // including the ones whose answer is "not yet".
        .filter((f) => f.report.sampleSize > 0),
    [socialPosts],
  )
  const bestWeekdays = useMemo(
    () =>
      new Set(
        timingFinds
          .filter((f) => f.report.verdict === 'recommend' && f.report.best!.weekday >= 0)
          .map((f) => f.report.best!.weekday),
      ),
    [timingFinds],
  )

  const unscheduled = useMemo(() => episodes.filter((ep) => !ep.scheduledDate), [episodes])
  const { setNodeRef: setUnscheduledRef, isOver: isOverUnscheduled } = useDroppable({ id: 'unscheduled' })

  const activeEpisode = activeId ? episodes.find((ep) => ep.id === activeId) : undefined

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const episodeId = String(active.id)
    const targetId = String(over.id)
    const nextDate = targetId === 'unscheduled' ? undefined : targetId
    const episode = episodes.find((ep) => ep.id === episodeId)
    if (!episode || episode.scheduledDate === nextDate) return
    updateEpisode(episodeId, { scheduledDate: nextDate })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-10 py-10">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2.5 font-display text-[28px] tracking-tight text-ink">
              <Calendar size={24} className="text-gold" strokeWidth={1.75} />
              Content Calendar
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-dim">
              {projectFilter === 'all'
                ? 'Plan what goes out and when, across every project.'
                : `Plan what goes out and when for ${projectById.get(projectFilter)?.name ?? 'this project'}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button
                onClick={() => setWeekStart((w) => addDays(w, -7))}
                className="rounded-md p-1.5 text-ink-faint transition hover:bg-surface-2 hover:text-ink"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setWeekStart(startOfWeek(new Date()))}
                className="px-2.5 py-1 text-[12px] font-medium text-ink-dim transition hover:text-ink"
              >
                Today
              </button>
              <button
                onClick={() => setWeekStart((w) => addDays(w, 7))}
                className="rounded-md p-1.5 text-ink-faint transition hover:bg-surface-2 hover:text-ink"
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <span className="text-[13px] font-medium text-ink-dim">{formatWeekRange(days[0], days[6])}</span>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setProjectFilter('all')}
            aria-pressed={projectFilter === 'all'}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition ${
              projectFilter === 'all'
                ? 'border-gold bg-gold-soft text-gold'
                : 'border-border text-ink-dim hover:border-ink-faint hover:text-ink'
            }`}
          >
            <LayoutGrid size={13} />
            All
            <span className="text-[10.5px] opacity-70">{countsByProject.total}</span>
          </button>

          {projects.map((p) => {
            const active = projectFilter === p.id
            return (
              <button
                key={p.id}
                onClick={() => setProjectFilter(p.id)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition ${
                  active ? 'text-ink' : 'border-border text-ink-dim hover:border-ink-faint hover:text-ink'
                }`}
                style={active ? { borderColor: p.color, backgroundColor: `${p.color}1f` } : undefined}
              >
                <span style={{ color: p.color }}>
                  <Icon name={p.icon} size={13} />
                </span>
                {p.name}
                <span className="text-[10.5px] opacity-70">{countsByProject.byProject.get(p.id) ?? 0}</span>
              </button>
            )
          })}
        </div>

        <PostingPlan finds={timingFinds} onOpenAnalytics={() => pageNavigate('/analytics')} />

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-dim">
              Unscheduled
              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-faint">
                {unscheduled.length}
              </span>
            </div>
            <div
              ref={setUnscheduledRef}
              className={`flex min-h-[86px] items-center gap-2.5 overflow-x-auto rounded-xl border p-2.5 transition ${
                isOverUnscheduled ? 'border-gold bg-gold-soft' : 'border-dashed border-border bg-surface-2/50'
              }`}
            >
              {unscheduled.length === 0 ? (
                <span className="px-2 text-[12.5px] text-ink-faint italic">
                  {projectFilter === 'all'
                    ? 'Every episode is scheduled. Drag a card here to unschedule it.'
                    : `Every episode in ${projectById.get(projectFilter)?.name ?? 'this project'} is scheduled. Drag a card here to unschedule it.`}
                </span>
              ) : (
                unscheduled.map((ep) => {
                  const proj = projectById.get(ep.projectId)
                  return (
                    <div key={ep.id} className="w-[190px] shrink-0">
                      <EpisodeCard
                        episode={ep}
                        projectColor={proj?.color ?? '#d3a75c'}
                        projectIcon={proj?.icon ?? 'film'}
                        projectName={proj?.name ?? ''}
                      />
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-3">
            {days.map((day, i) => {
              const key = toDateKey(day)
              return (
                <DayColumn
                  key={key}
                  id={key}
                  label={DAY_LABELS[i]}
                  dayNumber={day.getDate()}
                  isToday={key === todayKey}
                  isBestDay={bestWeekdays.has(i)}
                  episodes={episodesByDate.get(key) ?? []}
                  projectById={projectById}
                />
              )
            })}
          </div>

          <DragOverlay>
            {activeEpisode ? (
              <div className="w-[190px]">
                <EpisodeCard
                  episode={activeEpisode}
                  projectColor={projectById.get(activeEpisode.projectId)?.color ?? '#d3a75c'}
                  projectIcon={projectById.get(activeEpisode.projectId)?.icon ?? 'film'}
                  projectName={projectById.get(activeEpisode.projectId)?.name ?? ''}
                  dragging
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}
