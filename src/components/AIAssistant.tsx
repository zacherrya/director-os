import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMatch } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { askAssistant, buildAssistantContext, type AssistantMessage } from '../lib/assistant'
import { hasOpenAiKey } from '../lib/credentials'
import { Icon, Loader2, Sparkles, X } from './Icon'
import { SettingsModal } from './SettingsModal'

const GENERIC_SUGGESTIONS = [
  'What should I make next?',
  'Which of my videos worked best, and why?',
]

const EPISODE_SUGGESTIONS = [
  'Where is this episode losing people?',
  'Rewrite my hook three ways',
  'Is this too long?',
  'Suggest B-roll for the lesson beat',
]

export function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [thinking, setThinking] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const episodes = useAppStore((s) => s.episodes)
  const projects = useAppStore((s) => s.projects)
  const socialPosts = useAppStore((s) => s.socialPosts)
  const playbook = useAppStore((s) => s.playbook)

  // Whatever episode the creator is looking at is what they're asking about.
  const match = useMatch('/projects/:projectId/episodes/:episodeId/*')
  const projectId = match?.params.projectId
  const episodeId = match?.params.episodeId
  const episode = episodes.find((e) => e.id === episodeId)
  const project = projects.find((p) => p.id === projectId)

  const ctx = useMemo(
    () => buildAssistantContext(episodes, socialPosts, playbook, project, episode),
    [episodes, socialPosts, playbook, project, episode],
  )

  const suggestions = episode ? EPISODE_SUGGESTIONS : GENERIC_SUGGESTIONS
  const connected = hasOpenAiKey()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || thinking) return
    if (!connected) {
      setSettingsOpen(true)
      return
    }
    const next: AssistantMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setInput('')
    setThinking(true)
    try {
      const reply = await askAssistant(next, ctx)
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (err) {
      setMessages([
        ...next,
        { role: 'assistant', content: err instanceof Error ? err.message : 'Something went wrong.' },
      ])
    } finally {
      setThinking(false)
    }
  }

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
        aria-label="Ask AI about this episode"
        className="fixed right-6 bottom-6 z-40 flex items-center gap-2 rounded-full bg-gold px-4 py-3 text-[13px] font-medium text-[#141316] shadow-lg"
        style={{ boxShadow: '0 8px 24px rgba(211, 167, 92, 0.35)' }}
      >
        <Sparkles size={16} />
        Ask AI
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed top-0 right-0 z-50 flex h-full w-[380px] flex-col overflow-hidden border-l border-border bg-surface shadow-2xl"
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="AI assistant"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-soft text-gold">
                      <Sparkles size={15} />
                    </div>
                    <span className="text-[14px] font-medium text-ink">Ask AI</span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-ink-faint">
                    {episode ? `Looking at “${episode.title}”` : 'No episode open — open one for specific help'}
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close assistant"
                  className="rounded-md p-1 text-ink-faint hover:bg-surface-2"
                >
                  <X size={16} />
                </button>
              </div>

              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messages.length === 0 && (
                  <div className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-dim">
                    {connected
                      ? 'I can see the episode you have open, your playbook, and any published results you’ve linked. Ask about this video specifically.'
                      : 'Add an OpenAI API key in Settings and I can help with hooks, pacing, and what to make next.'}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                      m.role === 'assistant' ? 'bg-surface-2 text-ink-dim' : 'ml-auto bg-gold-soft text-ink'
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {thinking && (
                  <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-faint">
                    <Loader2 size={13} className="animate-spin" />
                    Thinking…
                  </div>
                )}
              </div>

              <div className="border-t border-border px-4 py-3">
                {messages.length === 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="max-w-full rounded-full border border-border px-2.5 py-1 text-left text-[11px] whitespace-normal text-ink-dim transition hover:border-gold hover:text-gold"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <Icon name="wand-2" size={15} className="text-ink-faint" />
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && send(input)}
                    placeholder={connected ? 'Ask about this episode…' : 'Add a key in Settings first'}
                    aria-label="Message the assistant"
                    className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-faint"
                  />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {settingsOpen && <SettingsModal initialTab="AI" onClose={() => setSettingsOpen(false)} />}
    </>
  )
}
