import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import type { Project } from '../lib/types'
import { useAppStore } from '../store/appStore'
import { Icon, Plus, Search, Trash2 } from '../components/Icon'
import { NewProjectModal } from '../components/NewProjectModal'
import { DeleteProjectModal } from '../components/DeleteProjectModal'

export function ProjectsDashboard() {
  const allProjects = useAppStore((s) => s.projects)
  const episodes = useAppStore((s) => s.episodes)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  const projects = useMemo(() => allProjects.filter((p) => !p.deletedAt), [allProjects])
  const filtered = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-10 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="font-display text-[28px] tracking-tight text-ink">Projects</h1>
            <p className="mt-1 text-[13.5px] text-ink-dim">
              Every show you’re directing, planned before a single frame is shot.
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2.5 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright"
          >
            <Plus size={15} strokeWidth={2} />
            New Project
          </button>
        </div>

        <div className="mb-7 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 max-w-[320px]">
          <Search size={15} className="text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p, i) => {
            const eps = episodes.filter((e) => e.projectId === p.id && !e.deletedAt)
            const inProgress = eps.filter((e) => e.status !== 'Published').length
            const avgCompletion =
              eps.length > 0 ? Math.round(eps.reduce((sum, e) => sum + e.completion, 0) / eps.length) : 0

            return (
              <motion.div
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -3 }}
                className="group flex cursor-pointer flex-col rounded-2xl border border-border bg-surface p-5 text-left shadow-sm transition hover:border-gold/40 hover:shadow-lg"
              >
                <div className="mb-6 flex items-center justify-between">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${p.color}22`, color: p.color }}
                  >
                    <Icon name={p.icon} size={20} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(p)
                      }}
                      title="Delete project"
                      aria-label="Delete project"
                      className="rounded-md p-1 text-ink-faint opacity-0 transition hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                    <span className="rounded-full border border-border-soft px-2.5 py-1 text-[10.5px] font-medium text-ink-dim">
                      {eps.length} episode{eps.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                <h3 className="font-display text-[18px] text-ink">{p.name}</h3>
                <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-dim">{p.description}</p>

                <div className="mt-6">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-faint">
                    <span>Avg. completion</span>
                    <span className="text-ink-dim">{avgCompletion}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-soft">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${avgCompletion}%`, backgroundColor: p.color }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border-soft pt-3.5 text-[11.5px] text-ink-faint">
                  <span>{inProgress} in production</span>
                  <span className="text-ink-dim opacity-0 transition group-hover:opacity-100">Open →</span>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {modalOpen && <NewProjectModal onClose={() => setModalOpen(false)} />}
      {deleteTarget && <DeleteProjectModal project={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </div>
  )
}
