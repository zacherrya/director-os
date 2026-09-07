import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './lib/theme'
import { Sidebar } from './components/Sidebar'
import { AIAssistant } from './components/AIAssistant'
import { ProjectsDashboard } from './pages/ProjectsDashboard'
import { ProjectEpisodes } from './pages/ProjectEpisodes'
import { EpisodeTimeline } from './pages/EpisodeTimeline'
import { PublishView } from './pages/PublishView'
import { StoryboardView } from './pages/StoryboardView'
import { AssetManager } from './pages/AssetManager'
import { PatternLibrary } from './pages/PatternLibrary'
import { ContentCalendar } from './pages/ContentCalendar'
import { RecentlyDeleted } from './pages/RecentlyDeleted'
import { Analytics } from './pages/Analytics'
import { Partnerships } from './pages/Partnerships'
import { Playbook } from './pages/Playbook'
import { onPersistFailure, useAppStore } from './store/appStore'
import { toast } from './lib/toast'
import { Toaster } from './components/Toaster'
import { ErrorBoundary } from './components/ErrorBoundary'
import { CommandPalette } from './components/CommandPalette'

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)

  // A failed save used to be completely silent. Surface it, once, as a sticky toast.
  useEffect(() => {
    let shown = false
    onPersistFailure((failure) => {
      if (failure && !shown) {
        shown = true
        toast.error(failure.message)
      } else if (!failure) {
        shown = false
      }
    })
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta) return

      // Cmd+K works while typing too — it's how you leave what you're doing.
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }

      if (e.key.toLowerCase() !== 'z') return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      if (e.shiftKey) {
        useAppStore.getState().redo()
      } else {
        useAppStore.getState().undo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ThemeProvider>
      <ErrorBoundary>
      <BrowserRouter>
        <div className="flex h-screen w-screen overflow-hidden bg-bg text-ink">
          <Sidebar />
          <main className="relative flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route path="/projects" element={<ProjectsDashboard />} />
              <Route path="/templates" element={<PatternLibrary />} />
              <Route path="/calendar" element={<ContentCalendar />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/partnerships" element={<Partnerships />} />
              {/* The media kit lives inside Partnerships now; keep the old path working. */}
              <Route path="/media-kit" element={<Navigate to="/partnerships" replace />} />
              <Route path="/playbook" element={<Playbook />} />
              <Route path="/trash" element={<RecentlyDeleted />} />
              <Route path="/projects/:projectId" element={<ProjectEpisodes />} />
              <Route path="/projects/:projectId/assets" element={<AssetManager />} />
              <Route path="/projects/:projectId/episodes/:episodeId" element={<EpisodeTimeline />} />
              <Route
                path="/projects/:projectId/episodes/:episodeId/storyboard"
                element={<StoryboardView />}
              />
              <Route
                path="/projects/:projectId/episodes/:episodeId/publish"
                element={<PublishView />}
              />
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
          </main>
          <AIAssistant />
          <Toaster />
          {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
        </div>
      </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  )
}

export default App
