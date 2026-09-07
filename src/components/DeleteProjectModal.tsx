import { motion, AnimatePresence } from 'framer-motion'
import type { Project } from '../lib/types'
import { useAppStore } from '../store/appStore'
import { Icon, Trash2, X } from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'

export function DeleteProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  useEscapeKey(onClose)

  const episodes = useAppStore((s) => s.episodes)
  const deleteProject = useAppStore((s) => s.deleteProject)
  const episodeCount = episodes.filter((e) => e.projectId === project.id && !e.deletedAt).length

  function handleDelete() {
    deleteProject(project.id)
    onClose()
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-[420px] rounded-2xl border border-border bg-surface p-6 shadow-2xl"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-400/10 text-red-400">
                <Trash2 size={15} />
              </div>
              <h2 className="font-display text-[19px] text-ink">Delete Project</h2>
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink">
              <X size={16} />
            </button>
          </div>

          <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${project.color}22`, color: project.color }}
            >
              <Icon name={project.icon} size={16} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium text-ink">{project.name}</div>
              <div className="text-[11.5px] text-ink-faint">
                {episodeCount} episode{episodeCount === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          <p className="mb-6 text-[13px] leading-relaxed text-ink-dim">
            This moves <span className="font-medium text-ink">{project.name}</span> to{' '}
            <span className="font-medium text-ink">Recently Deleted</span>, where it's kept for 30 days before
            being permanently removed. You can restore it any time before then.
          </p>

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-ink-dim hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-2 text-[13px] font-medium text-red-400 transition hover:bg-red-400/20"
            >
              <Trash2 size={14} />
              Delete Project
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
