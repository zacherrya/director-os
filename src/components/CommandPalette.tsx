import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useEscapeKey } from '../lib/useEscapeKey'
import { Icon, Search } from './Icon'

interface Result {
  id: string
  kind: 'Project' | 'Episode' | 'Scene' | 'Page'
  title: string
  subtitle: string
  icon: string
  color?: string
  to: string
}

const PAGES: Result[] = [
  { id: 'p-projects', kind: 'Page', title: 'Projects', subtitle: 'All your shows', icon: 'layers', to: '/projects' },
  { id: 'p-templates', kind: 'Page', title: 'Templates', subtitle: 'Pattern library', icon: 'clipboard-list', to: '/templates' },
  { id: 'p-playbook', kind: 'Page', title: 'Playbook', subtitle: 'Rules you enforce', icon: 'clipboard-list', to: '/playbook' },
  { id: 'p-calendar', kind: 'Page', title: 'Content Calendar', subtitle: 'What goes out when', icon: 'film', to: '/calendar' },
  { id: 'p-analytics', kind: 'Page', title: 'Analytics', subtitle: 'How posts performed', icon: 'sparkles', to: '/analytics' },
  { id: 'p-trash', kind: 'Page', title: 'Recently Deleted', subtitle: 'Restore or purge', icon: 'wrench', to: '/trash' },
]

export function CommandPalette({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose)
  const navigate = useNavigate()
  const projects = useAppStore((s) => s.projects)
  const episodes = useAppStore((s) => s.episodes)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out: Result[] = []
    const liveProjects = projects.filter((p) => !p.deletedAt)

    for (const p of liveProjects) {
      if (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) {
        out.push({
          id: p.id, kind: 'Project', title: p.name, subtitle: p.description || 'Project',
          icon: p.icon, color: p.color, to: `/projects/${p.id}`,
        })
      }
    }

    for (const ep of episodes.filter((e) => !e.deletedAt)) {
      const proj = liveProjects.find((p) => p.id === ep.projectId)
      if (!proj) continue
      if (!q || ep.title.toLowerCase().includes(q)) {
        out.push({
          id: ep.id, kind: 'Episode', title: ep.title,
          subtitle: `${proj.name} · Lesson ${String(ep.number).padStart(3, '0')}`,
          icon: proj.icon, color: proj.color,
          to: `/projects/${ep.projectId}/episodes/${ep.id}`,
        })
      }

      // Scene-level search is the whole point: finding a line you half-remember.
      if (q.length >= 2) {
        for (const s of ep.scenes) {
          const haystack = `${s.dialogue} ${s.visual} ${s.purpose} ${s.onScreenText.text}`.toLowerCase()
          if (haystack.includes(q)) {
            out.push({
              id: `${ep.id}-${s.id}`, kind: 'Scene',
              title: s.dialogue.trim() || s.visual.trim() || `${s.purpose} beat`,
              subtitle: `${ep.title} · Scene ${s.index} · ${s.purpose}`,
              icon: proj.icon, color: proj.color,
              to: `/projects/${ep.projectId}/episodes/${ep.id}?scene=${s.id}`,
            })
          }
        }
      }
    }

    for (const p of PAGES) {
      if (!q || p.title.toLowerCase().includes(q)) out.push(p)
    }

    return out.slice(0, 40)
  }, [query, projects, episodes])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function choose(r: Result | undefined) {
    if (!r) return
    navigate(r.to)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] overflow-hidden rounded-xl border border-border bg-elevated shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search size={16} className="shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(results[active])
              }
            }}
            placeholder="Search projects, episodes, or a line of dialogue…"
            aria-label="Search projects, episodes and scenes"
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-ink-faint">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-ink-faint">No matches.</p>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              data-idx={i}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                i === active ? 'bg-surface-2' : ''
              }`}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                style={
                  r.color
                    ? { backgroundColor: `${r.color}22`, color: r.color }
                    : { backgroundColor: 'var(--dos-surface-2)', color: 'var(--dos-ink-faint)' }
                }
              >
                <Icon name={r.icon} size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{r.title}</span>
                <span className="block truncate text-[11px] text-ink-faint">{r.subtitle}</span>
              </span>
              <span className="shrink-0 text-[10px] tracking-wide text-ink-faint uppercase">{r.kind}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
