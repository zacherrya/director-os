import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { dismissToast, subscribeToasts, type Toast } from '../lib/toast'
import { Check, X } from './Icon'

const TONE = {
  error: { border: '#c96a4a', bg: 'rgba(201, 106, 74, 0.12)', fg: '#c96a4a' },
  success: { border: '#6bb15a', bg: 'rgba(107, 177, 90, 0.12)', fg: '#6bb15a' },
  info: { border: 'var(--dos-border)', bg: 'var(--dos-surface-2)', fg: 'var(--dos-ink-dim)' },
} as const

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => subscribeToasts(setToasts), [])

  return (
    // Bottom-left: the Ask AI button owns the bottom-right corner.
    <div className="pointer-events-none fixed bottom-6 left-6 z-[60] flex w-[360px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const tone = TONE[t.tone]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg backdrop-blur-sm"
              style={{ borderColor: tone.border, backgroundColor: tone.bg }}
            >
              <span className="mt-0.5 shrink-0" style={{ color: tone.fg }}>
                {t.tone === 'success' ? <Check size={14} /> : <X size={14} />}
              </span>
              <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink">{t.message}</p>
              <button
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 text-ink-faint transition hover:text-ink"
              >
                <X size={13} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
