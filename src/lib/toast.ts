/**
 * Tiny toast bus.
 *
 * Deliberately a module-level emitter rather than React context: it's also
 * called from outside the component tree (the store's save-failure handler),
 * and a context would have meant threading a provider through every caller.
 */

export type ToastTone = 'error' | 'info' | 'success'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
  /** Errors stay until dismissed; transient notices expire. */
  sticky: boolean
}

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
const listeners = new Set<Listener>()
let nextId = 1

function emit() {
  const snapshot = [...toasts]
  listeners.forEach((l) => l(snapshot))
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener([...toasts])
  return () => listeners.delete(listener)
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function push(tone: ToastTone, message: string, sticky: boolean) {
  const id = nextId++
  toasts = [...toasts, { id, tone, message, sticky }]
  emit()
  if (!sticky) setTimeout(() => dismissToast(id), 5000)
  return id
}

export const toast = {
  /** Errors are sticky — a failure the user didn't read is a failure they'll hit again. */
  error: (message: string) => push('error', message, true),
  info: (message: string) => push('info', message, false),
  success: (message: string) => push('success', message, false),
  /** Replaces any existing toast carrying the same key message, for repeated conditions. */
  dismissAll: () => {
    toasts = []
    emit()
  },
}
