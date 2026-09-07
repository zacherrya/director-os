import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROJECT_TRASH_DAYS, useAppStore } from '../store/appStore'
import { Check, Icon, RotateCcw, Trash2, X } from '../components/Icon'

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
}

function timeline(deletedAt: string) {
  const elapsed = daysSince(deletedAt)
  const remaining = Math.max(0, PROJECT_TRASH_DAYS - elapsed)
  return `Deleted ${elapsed === 0 ? 'today' : `${elapsed}d ago`} · ${remaining === 0 ? 'Purges today' : `Purges in ${remaining}d`}`
}

function Row({
  icon,
  iconColor,
  title,
  subtitle,
  confirming,
  onRestore,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onOpen,
}: {
  icon: string
  iconColor: string
  title: string
  subtitle: string
  confirming: boolean
  onRestore: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onOpen?: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5">
      <button
        onClick={onOpen}
        disabled={!onOpen}
        className={`flex min-w-0 items-center gap-3 text-left ${onOpen ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl opacity-70"
          style={{ backgroundColor: `${iconColor}22`, color: iconColor }}
        >
          <Icon name={icon} size={17} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-ink">{title}</div>
          <div className="text-[11.5px] text-ink-faint">{subtitle}</div>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        {confirming ? (
          <>
            <span className="mr-1 text-[11.5px] font-medium text-red-400">Delete forever?</span>
            <button
              onClick={onCancelDelete}
              className="rounded-md p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
              title="Cancel"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
            <button
              onClick={onConfirmDelete}
              className="rounded-md bg-red-400/10 p-1.5 text-red-400 hover:bg-red-400/20"
              title="Confirm permanent delete"
              aria-label="Confirm permanent delete"
            >
              <Check size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onRestore}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-ink-dim transition hover:border-gold hover:text-gold"
            >
              <RotateCcw size={13} />
              Restore
            </button>
            <button
              onClick={onRequestDelete}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-ink-faint transition hover:border-red-400/40 hover:text-red-400"
            >
              <Trash2 size={13} />
              Delete Permanently
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function RecentlyDeleted() {
  const allProjects = useAppStore((s) => s.projects)
  const allEpisodes = useAppStore((s) => s.episodes)
  const restoreProject = useAppStore((s) => s.restoreProject)
  const permanentlyDeleteProject = useAppStore((s) => s.permanentlyDeleteProject)
  const restoreEpisode = useAppStore((s) => s.restoreEpisode)
  const permanentlyDeleteEpisode = useAppStore((s) => s.permanentlyDeleteEpisode)
  const navigate = useNavigate()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const deletedProjects = useMemo(
    () =>
      allProjects
        .filter((p) => p.deletedAt)
        .sort((a, b) => new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime()),
    [allProjects],
  )
  const deletedProjectIds = useMemo(() => new Set(deletedProjects.map((p) => p.id)), [deletedProjects])

  // An episode deleted from an already-deleted project is implied by the project row above it — only
  // surface episodes whose parent project is still active, so nothing gets listed twice.
  const deletedEpisodes = useMemo(
    () =>
      allEpisodes
        .filter((ep) => ep.deletedAt && !deletedProjectIds.has(ep.projectId))
        .sort((a, b) => new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime()),
    [allEpisodes, deletedProjectIds],
  )

  const projectById = useMemo(() => {
    const m = new Map<string, { name: string; color: string; icon: string }>()
    allProjects.forEach((p) => m.set(p.id, { name: p.name, color: p.color, icon: p.icon }))
    return m
  }, [allProjects])

  const isEmpty = deletedProjects.length === 0 && deletedEpisodes.length === 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-10 py-10">
        <div className="mb-8">
          <h1 className="flex items-center gap-2.5 font-display text-[28px] tracking-tight text-ink">
            <Trash2 size={22} className="text-ink-faint" strokeWidth={1.75} />
            Recently Deleted
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-dim">
            Deleted projects and episodes are kept here for {PROJECT_TRASH_DAYS} days, then removed permanently.
          </p>
        </div>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
            <Trash2 size={28} className="mb-3 text-ink-faint" strokeWidth={1.5} />
            <p className="text-[13.5px] text-ink-dim">Nothing here right now.</p>
            <p className="mt-1 text-[12px] text-ink-faint">Deleted projects and episodes will show up here for 30 days.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {deletedProjects.length > 0 && (
              <div>
                <div className="mb-2.5 text-[11.5px] font-medium tracking-wide text-ink-faint uppercase">
                  Projects
                </div>
                <div className="flex flex-col gap-2.5">
                  {deletedProjects.map((p) => {
                    const eps = allEpisodes.filter((e) => e.projectId === p.id)
                    return (
                      <Row
                        key={p.id}
                        icon={p.icon}
                        iconColor={p.color}
                        title={p.name}
                        subtitle={`${eps.length} episode${eps.length === 1 ? '' : 's'} · ${timeline(p.deletedAt!)}`}
                        confirming={confirmingId === p.id}
                        onRestore={() => restoreProject(p.id)}
                        onRequestDelete={() => setConfirmingId(p.id)}
                        onCancelDelete={() => setConfirmingId(null)}
                        onConfirmDelete={() => {
                          permanentlyDeleteProject(p.id)
                          setConfirmingId(null)
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {deletedEpisodes.length > 0 && (
              <div>
                <div className="mb-2.5 text-[11.5px] font-medium tracking-wide text-ink-faint uppercase">
                  Episodes
                </div>
                <div className="flex flex-col gap-2.5">
                  {deletedEpisodes.map((ep) => {
                    const proj = projectById.get(ep.projectId)
                    return (
                      <Row
                        key={ep.id}
                        icon={proj?.icon ?? 'film'}
                        iconColor={proj?.color ?? '#d3a75c'}
                        title={ep.title}
                        subtitle={`${proj?.name ?? 'Unknown project'} · ${ep.scenes.length} scene${ep.scenes.length === 1 ? '' : 's'} · ${timeline(ep.deletedAt!)}`}
                        confirming={confirmingId === ep.id}
                        onRestore={() => restoreEpisode(ep.id)}
                        onRequestDelete={() => setConfirmingId(ep.id)}
                        onCancelDelete={() => setConfirmingId(null)}
                        onConfirmDelete={() => {
                          permanentlyDeleteEpisode(ep.id)
                          setConfirmingId(null)
                        }}
                        onOpen={() => navigate(`/projects/${ep.projectId}/episodes/${ep.id}`)}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
