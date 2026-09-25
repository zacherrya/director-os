/**
 * The edits, one per episode.
 *
 * Kept apart from the main app store on purpose. An edit is a different kind of
 * thing — it changes many times a second while a handle is being dragged — and
 * giving it its own small persisted slice means a drag never reserialises the
 * whole workspace, and a problem in one can't corrupt the other.
 *
 * Only references are stored: paths, trims, text. The footage stays on disk.
 * A source's object URL, which only exists for footage imported in a plain
 * browser session, is stripped on save because it is dead after a reload.
 *
 * Undo history is per episode and in memory only. It is a tool for the session
 * you are in, not something to restore a week later.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { newProject, type EditProject } from '../lib/editor/model'
import type { Episode } from '../lib/types'

const HISTORY_LIMIT = 100

interface History {
  past: EditProject[]
  future: EditProject[]
}

interface EditState {
  edits: Record<string, EditProject>
  history: Record<string, History>
  /** Returns the episode's edit, creating an empty one the first time. */
  ensure: (episode: Pick<Episode, 'id' | 'format'>) => EditProject
  /**
   * Replaces an edit. `coalesce` merges this change into the last undo step —
   * for the stream of updates a single drag produces, which should undo as one.
   */
  commit: (next: EditProject, options?: { coalesce?: boolean }) => void
  undo: (episodeId: string) => void
  redo: (episodeId: string) => void
  canUndo: (episodeId: string) => boolean
  canRedo: (episodeId: string) => boolean
}

const emptyHistory: History = { past: [], future: [] }

export const useEditStore = create<EditState>()(
  persist(
    (set, get) => ({
      edits: {},
      history: {},

      ensure: (episode) => {
        const existing = get().edits[episode.id]
        if (existing) return existing
        const created = newProject(episode)
        set((s) => ({ edits: { ...s.edits, [episode.id]: created } }))
        return created
      },

      commit: (next, options = {}) =>
        set((s) => {
          const id = next.episodeId
          const prev = s.edits[id]
          const h = s.history[id] ?? emptyHistory
          const past = options.coalesce || !prev ? h.past : [...h.past, prev].slice(-HISTORY_LIMIT)
          return {
            edits: { ...s.edits, [id]: next },
            history: { ...s.history, [id]: { past, future: [] } },
          }
        }),

      undo: (id) =>
        set((s) => {
          const h = s.history[id]
          const current = s.edits[id]
          if (!h?.past.length || !current) return s
          const previous = h.past[h.past.length - 1]
          return {
            edits: { ...s.edits, [id]: previous },
            history: { ...s.history, [id]: { past: h.past.slice(0, -1), future: [current, ...h.future] } },
          }
        }),

      redo: (id) =>
        set((s) => {
          const h = s.history[id]
          const current = s.edits[id]
          if (!h?.future.length || !current) return s
          const [next, ...rest] = h.future
          return {
            edits: { ...s.edits, [id]: next },
            history: { ...s.history, [id]: { past: [...h.past, current], future: rest } },
          }
        }),

      canUndo: (id) => (get().history[id]?.past.length ?? 0) > 0,
      canRedo: (id) => (get().history[id]?.future.length ?? 0) > 0,
    }),
    {
      name: 'director-os-edits',
      version: 1,
      partialize: (s) => ({
        edits: Object.fromEntries(
          Object.entries(s.edits).map(([id, p]) => [
            id,
            { ...p, sources: p.sources.map(({ url: _url, ...rest }) => rest) },
          ]),
        ),
      }),
    },
  ),
)
