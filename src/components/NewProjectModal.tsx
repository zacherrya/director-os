import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { X } from './Icon'
import { Icon } from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'

const colorOptions = ['#d3a75c', '#4f8fc0', '#6bb15a', '#8a7bd8', '#c96a4a', '#b6598f']
const iconOptions = ['clapperboard', 'shirt', 'flame', 'home', 'film', 'camera', 'sparkles', 'music']

export function NewProjectModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose)

  const createProject = useAppStore((s) => s.createProject)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(colorOptions[0])
  const [icon, setIcon] = useState(iconOptions[0])

  function handleCreate() {
    if (!name.trim()) return
    const project = createProject(name.trim(), description.trim(), color, icon)
    onClose()
    navigate(`/projects/${project.id}`)
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
            <h2 className="font-display text-[19px] text-ink">New Project</h2>
            <button onClick={onClose} className="rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink">
              <X size={16} />
            </button>
          </div>

          <label className="mb-1 block text-[12px] font-medium text-ink-dim">Project name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning Routine Series"
            className="mb-4 w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-gold"
          />

          <label className="mb-1 block text-[12px] font-medium text-ink-dim">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project about?"
            rows={2}
            className="mb-4 w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-gold"
          />

          <label className="mb-1.5 block text-[12px] font-medium text-ink-dim">Accent color</label>
          <div className="mb-4 flex gap-2">
            {colorOptions.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition"
                style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px ${c}` : 'none' }}
              />
            ))}
          </div>

          <label className="mb-1.5 block text-[12px] font-medium text-ink-dim">Icon</label>
          <div className="mb-6 flex gap-2">
            {iconOptions.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                  icon === i ? 'border-gold bg-gold-soft text-gold' : 'border-border text-ink-dim hover:border-ink-faint'
                }`}
              >
                <Icon name={i} size={15} />
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-ink-dim hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="rounded-lg bg-gold px-4 py-2 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create Project
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
