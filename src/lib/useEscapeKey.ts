import { useEffect } from 'react'

/** Closes a modal on Escape. Every dialog in the app should use this — without it
 * the only way out is finding and clicking the right button. */
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onEscape()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onEscape])
}
