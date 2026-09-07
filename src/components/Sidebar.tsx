import { NavLink, useParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { Icon, Calendar, FolderKanban, ListChecks, Search, Settings, Trash2, TrendingUp, Plus, Sun, Moon } from './Icon'
import { useEffect, useState } from 'react'
import { subscribePersistStatus, type PersistStatus } from '../store/appStore'
import { NewProjectModal } from './NewProjectModal'
import { SettingsModal } from './SettingsModal'
import { useTheme } from '../lib/theme'

/** Tells you whether your work is actually committed. Silence used to be the only
 * signal, which is indistinguishable from a broken save. */
function SaveIndicator() {
  const [status, setStatus] = useState<PersistStatus>('idle')
  useEffect(() => subscribePersistStatus(setStatus), [])

  if (status === 'idle') return null

  const copy = {
    saving: { text: 'Saving…', color: 'var(--dos-sidebar-ink-dim)' },
    saved: { text: 'All changes saved', color: 'var(--dos-sidebar-ink-dim)' },
    error: { text: 'Not saving — see the alert', color: '#c96a4a' },
  }[status]

  return (
    <div
      className="flex items-center gap-1.5 px-4 pb-2 text-[10.5px]"
      style={{ color: copy.color }}
      role="status"
      aria-live="polite"
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          backgroundColor: status === 'error' ? '#c96a4a' : status === 'saving' ? '#d3a75c' : '#6bb15a',
        }}
      />
      {copy.text}
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-ink-dim transition hover:bg-sidebar-hover hover:text-sidebar-ink"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
    </button>
  )
}

const soonItems: { label: string; icon: React.ReactNode }[] = []

export function Sidebar() {
  const allProjects = useAppStore((s) => s.projects)
  const { projectId } = useParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const projects = allProjects.filter((p) => !p.deletedAt)
  const deletedCount = allProjects.length - projects.length

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-ink">
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gold text-[#141316]">
          <Icon name="clapperboard" size={16} />
        </div>
        <span className="font-display text-[17px] tracking-tight text-sidebar-ink">Director OS</span>
      </div>

      <div className="px-4">
        <button
          onClick={() => setModalOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sidebar-ink px-3 py-2.5 text-[13px] font-medium text-sidebar transition hover:opacity-90"
        >
          <Plus size={15} strokeWidth={2} />
          New Project
        </button>
      </div>

      <div className="mt-3 px-4">
        <button
          onClick={() =>
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border px-2.5 py-1.5 text-[12.5px] text-sidebar-ink-dim transition hover:border-sidebar-ink-dim/40 hover:text-sidebar-ink"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-sidebar-ink-dim/25 px-1 py-px text-[9.5px]">⌘K</kbd>
        </button>
      </div>

      <nav className="mt-4 flex flex-col gap-0.5 px-3">
        <NavLink
          to="/projects"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition ${
              isActive
                ? 'bg-sidebar-hover text-sidebar-ink'
                : 'text-sidebar-ink-dim hover:bg-sidebar-hover hover:text-sidebar-ink'
            }`
          }
        >
          <FolderKanban size={17} strokeWidth={1.75} />
          Projects
        </NavLink>
        <NavLink
          to="/templates"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition ${
              isActive
                ? 'bg-sidebar-hover text-sidebar-ink'
                : 'text-sidebar-ink-dim hover:bg-sidebar-hover hover:text-sidebar-ink'
            }`
          }
        >
          <ListChecks size={17} strokeWidth={1.75} />
          Templates
        </NavLink>
        {projectId && (
          <NavLink
            to={`/projects/${projectId}/assets`}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition ${
                isActive
                  ? 'bg-sidebar-hover text-sidebar-ink'
                  : 'text-sidebar-ink-dim hover:bg-sidebar-hover hover:text-sidebar-ink'
              }`
            }
          >
            <Icon name="layers" size={17} />
            Assets
          </NavLink>
        )}
        <NavLink
          to="/playbook"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition ${
              isActive
                ? 'bg-sidebar-hover text-sidebar-ink'
                : 'text-sidebar-ink-dim hover:bg-sidebar-hover hover:text-sidebar-ink'
            }`
          }
        >
          <Icon name="clipboard-list" size={17} />
          Playbook
        </NavLink>
        <NavLink
          to="/calendar"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition ${
              isActive
                ? 'bg-sidebar-hover text-sidebar-ink'
                : 'text-sidebar-ink-dim hover:bg-sidebar-hover hover:text-sidebar-ink'
            }`
          }
        >
          <Calendar size={17} strokeWidth={1.75} />
          Content Calendar
        </NavLink>
        <NavLink
          to="/analytics"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition ${
              isActive
                ? 'bg-sidebar-hover text-sidebar-ink'
                : 'text-sidebar-ink-dim hover:bg-sidebar-hover hover:text-sidebar-ink'
            }`
          }
        >
          <TrendingUp size={17} strokeWidth={1.75} />
          Analytics
        </NavLink>
        <NavLink
          to="/partnerships"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition ${
              isActive
                ? 'bg-sidebar-hover text-sidebar-ink'
                : 'text-sidebar-ink-dim hover:bg-sidebar-hover hover:text-sidebar-ink'
            }`
          }
        >
          <Icon name="megaphone" size={17} />
          Partnerships
        </NavLink>
        {soonItems.map((item) => (
          <div
            key={item.label}
            className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-[13.5px] text-sidebar-ink-dim/50"
            title="Coming soon"
          >
            <span className="flex items-center gap-2.5">
              {item.icon}
              {item.label}
            </span>
            <span className="rounded border border-sidebar-ink-dim/20 px-1.5 py-0.5 text-[9.5px] tracking-wide uppercase text-sidebar-ink-dim/50">
              Soon
            </span>
          </div>
        ))}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-sidebar-ink-dim transition hover:bg-sidebar-hover hover:text-sidebar-ink"
        >
          <Settings size={17} strokeWidth={1.75} />
          Settings
        </button>
      </nav>

      <div className="mt-6 flex-1 overflow-y-auto px-3">
        <div className="px-3 pb-2 text-[10.5px] font-medium tracking-wider text-sidebar-ink-dim/70 uppercase">
          Projects
        </div>
        <div className="flex flex-col gap-0.5">
          {projects.map((p) => (
            <NavLink
              key={p.id}
              to={`/projects/${p.id}`}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition ${
                  isActive || projectId === p.id
                    ? 'bg-sidebar-hover text-sidebar-ink'
                    : 'text-sidebar-ink-dim hover:bg-sidebar-hover hover:text-sidebar-ink'
                }`
              }
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: `${p.color}26`, color: p.color }}
              >
                <Icon name={p.icon} size={13} />
              </span>
              <span className="truncate">{p.name}</span>
            </NavLink>
          ))}
        </div>
      </div>

      <div className="px-3 py-2">
        <NavLink
          to="/trash"
          className={({ isActive }) =>
            `flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition ${
              isActive
                ? 'bg-sidebar-hover text-sidebar-ink-dim'
                : 'text-sidebar-ink-dim/70 hover:bg-sidebar-hover hover:text-sidebar-ink-dim'
            }`
          }
        >
          <span className="flex items-center gap-2.5">
            <Trash2 size={15} strokeWidth={1.75} />
            Recently Deleted
          </span>
          {deletedCount > 0 && (
            <span className="rounded-full bg-sidebar-ink-dim/15 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-ink-dim">
              {deletedCount}
            </span>
          )}
        </NavLink>
      </div>

      <SaveIndicator />

      <div className="flex items-center justify-between border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20 text-[12px] font-medium text-gold-bright">
            DR
          </div>
          <div className="leading-tight">
            <div className="text-[12.5px] text-sidebar-ink">Director</div>
            <div className="text-[10.5px] text-sidebar-ink-dim">Creator</div>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {modalOpen && <NewProjectModal onClose={() => setModalOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </aside>
  )
}
