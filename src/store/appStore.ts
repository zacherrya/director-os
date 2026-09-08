import { create } from 'zustand'
import {
  assets as seedAssets,
  episodes as seedEpisodes,
  projects as seedProjects,
} from '../data/seed'
import { patterns as seedPatterns } from '../data/patternSeed'
import { pruneUnusedFiles, resolveFileUrl } from '../lib/fileStore'
import { storeSceneImage } from '../lib/imageStore'
import type {
  MediaKitProfile,
  Episode,
  Pattern,
  PatternBeat,
  PlaybookRule,
  Project,
  ProjectAsset,
  Scene,
  SceneAsset,
  SpeakingPace,
} from '../lib/types'
import type { PostPerformance, SocialPlatform } from '../lib/social'
import type { Brand, Opportunity, OpportunityStage, PartnershipType } from '../lib/partnerships'
import { emptyContact, mergeContacts, type Contact } from '../lib/contacts'
import type { ChannelTags, ChannelVerdict } from '../lib/neighbourhood'
import type { RetentionSnapshot } from '../lib/retentionAnalysis'
import { DEFAULT_SPEAKING_PACE, PACE_WORDS_PER_SECOND } from '../lib/types'

const PERSIST_KEY = 'director-os-data'

interface PersistedData {
  projects: Project[]
  episodes: Episode[]
  assets: ProjectAsset[]
  patterns: Pattern[]
  /** Last-fetched published performance, cached so the timeline's draft check can
   * compare against real history without needing credentials or a network call. */
  socialPosts: PostPerformance[]
  playbook: PlaybookRule[]
  /** Which suggesting channels the creator has judged on- or off-target. */
  channelTags: ChannelTags
  /** Last-read retention shape per video, so the draft check can use it offline. */
  retention: RetentionSnapshot[]
  /** Title words used by the suggesting channels marked on-target, for caption drafting. */
  audienceVocabulary: string[]
  /** The typed-in half of the media kit; the numbers come from analytics. */
  mediaKit: MediaKitProfile
  brands: Brand[]
  opportunities: Opportunity[]
  contacts: Contact[]
}

export const EMPTY_MEDIA_KIT: MediaKitProfile = {
  displayName: '',
  tagline: '',
  contactEmail: '',
  location: '',
  positioning: '',
  audienceNote: '',
  collaborationNote: '',
  featuredPostIds: [],
}

function loadPersistedData(): PersistedData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.episodes) || !Array.isArray(parsed.assets)) {
      return null
    }
    // `patterns` was added after this persistence format shipped — older saves
    // won't have it. Default it instead of invalidating everything else.
    return {
      ...parsed,
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : seedPatterns,
      socialPosts: Array.isArray(parsed.socialPosts) ? parsed.socialPosts : [],
      playbook: Array.isArray(parsed.playbook) ? parsed.playbook : [],
      channelTags: parsed.channelTags && typeof parsed.channelTags === 'object' ? parsed.channelTags : {},
      retention: Array.isArray(parsed.retention) ? parsed.retention : [],
      audienceVocabulary: Array.isArray(parsed.audienceVocabulary) ? parsed.audienceVocabulary : [],
      mediaKit:
        parsed.mediaKit && typeof parsed.mediaKit === 'object'
          ? { ...EMPTY_MEDIA_KIT, ...parsed.mediaKit }
          : EMPTY_MEDIA_KIT,
      brands: Array.isArray(parsed.brands) ? parsed.brands : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
    } as PersistedData
  } catch {
    return null
  }
}

/** Runtime-only fields, stripped before saving. `image` and `musicFileUrl` are blob:
 * URLs that are dead on the next launch anyway, and `image` in particular used to
 * carry multi-megabyte base64 straight into the quota. */
function stripRuntimeFields(episodes: Episode[]): Episode[] {
  return episodes.map((ep) => ({
    ...ep,
    scenes: ep.scenes.map((s) => {
      const { image: _image, ...scene } = s
      const { musicFileUrl: _url, ...audio } = scene.audio
      return { ...scene, audio } as Scene
    }),
  }))
}

/** Surfaced to the UI so a failed save is never silent again, and so the user can
 * tell at a glance whether their work is committed. */
export type PersistFailure = { message: string } | null
export type PersistStatus = 'idle' | 'saving' | 'saved' | 'error'

let persistFailureListener: ((failure: PersistFailure) => void) | null = null
export function onPersistFailure(fn: (failure: PersistFailure) => void) {
  persistFailureListener = fn
}

const persistStatusListeners = new Set<(s: PersistStatus) => void>()
let persistStatus: PersistStatus = 'idle'
export function subscribePersistStatus(fn: (s: PersistStatus) => void): () => void {
  persistStatusListeners.add(fn)
  fn(persistStatus)
  return () => persistStatusListeners.delete(fn)
}
function setPersistStatus(s: PersistStatus) {
  persistStatus = s
  persistStatusListeners.forEach((fn) => fn(s))
}

function savePersistedData(data: PersistedData) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ ...data, episodes: stripRuntimeFields(data.episodes) }),
    )
    persistFailureListener?.(null)
    setPersistStatus('saved')
  } catch (err) {
    setPersistStatus('error')
    // Previously this threw uncaught inside a setTimeout: the save failed, every
    // later save failed too, and nothing told the user until work went missing.
    const quota = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)
    persistFailureListener?.({
      message: quota
        ? 'Your workspace is too large to save. Recent changes are not being stored — remove some scene images or export a backup from Settings.'
        : 'Could not save your workspace. Recent changes are not being stored.',
    })
    console.error('Workspace save failed', err)
  }
}

const persisted = loadPersistedData()

// Resume the id counter above any numeric-suffixed id already saved, so
// freshly created records can never collide with restored ones.
function highestSavedId(data: PersistedData | null): number {
  let max = 10000
  if (!data) return max
  const scan = (id: string) => {
    const match = id.match(/-(\d+)$/)
    if (match) max = Math.max(max, Number(match[1]))
  }
  data.projects.forEach((p) => scan(p.id))
  data.assets.forEach((a) => scan(a.id))
  data.episodes.forEach((ep) => {
    scan(ep.id)
    ep.scenes.forEach((s) => {
      scan(s.id)
      s.assets.forEach((a) => scan(a.id))
    })
  })
  data.patterns.forEach((p) => {
    scan(p.id)
    p.beats.forEach((b) => scan(b.id))
  })
  // Every persisted collection has to be scanned, not just the ones that existed
  // when this was written: a collection missed here restarts its counter at
  // 10001 on the next load and silently reuses ids that are already in use, so
  // two brands end up sharing one another's opportunities and contacts.
  data.brands.forEach((b) => scan(b.id))
  data.opportunities.forEach((o) => {
    scan(o.id)
    o.journey?.forEach((j) => scan(j.id))
    o.activity?.forEach((a) => scan(a.id))
  })
  data.contacts.forEach((c) => scan(c.id))
  return max
}

let idCounter = highestSavedId(persisted)
function nextId(prefix: string) {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

export interface NewPatternInput {
  name: string
  description: string
  category: Pattern['category']
  estDurationSeconds: number
  beats: Omit<PatternBeat, 'id'>[]
}

interface AppState {
  projects: Project[]
  episodes: Episode[]
  assets: ProjectAsset[]
  patterns: Pattern[]
  socialPosts: PostPerformance[]
  playbook: PlaybookRule[]
  channelTags: ChannelTags
  retention: RetentionSnapshot[]
  audienceVocabulary: string[]
  mediaKit: MediaKitProfile
  brands: Brand[]
  opportunities: Opportunity[]
  contacts: Contact[]

  /** Replaces the cached retention shapes after an analytics refresh. */
  setRetention: (snapshots: RetentionSnapshot[]) => void

  /** Records the words the on-target neighbourhood titles with. */
  setAudienceVocabulary: (words: string[]) => void

  /** Replaces the cached posts for one platform, leaving the other platform's alone. */
  setSocialPosts: (platform: SocialPlatform, posts: PostPerformance[]) => void

  /** Marks a suggesting channel on- or off-target; `undefined` clears the judgement. */
  setChannelTag: (channelId: string, verdict: ChannelVerdict | undefined) => void

  /** Replaces the whole workspace from a restored backup. */
  loadWorkspace: (data: {
    projects: Project[]
    episodes: Episode[]
    assets: ProjectAsset[]
    patterns: Pattern[]
    playbook: PlaybookRule[]
  }) => void

  updateMediaKit: (patch: Partial<MediaKitProfile>) => void

  createBrand: (name: string) => Brand
  updateBrand: (brandId: string, patch: Partial<Brand>) => void
  deleteBrand: (brandId: string) => void
  /** Opens an opportunity against a brand, in its first stage. */
  createOpportunity: (brandId: string, type: PartnershipType) => Opportunity
  updateOpportunity: (opportunityId: string, patch: Partial<Opportunity>) => void
  setOpportunityStage: (opportunityId: string, stage: OpportunityStage) => void
  deleteOpportunity: (opportunityId: string) => void

  /** Adds a person against a brand. Everything about them is user-supplied. */
  createContact: (brandId: string, patch?: Partial<Contact>) => Contact
  updateContact: (contactId: string, patch: Partial<Contact>) => void
  deleteContact: (contactId: string) => void
  /** Folds one record into another, keeping the survivor's own values. */
  mergeContact: (keepId: string, dropId: string) => void
  addPlaybookRule: (rule: Omit<PlaybookRule, 'id' | 'createdAt'>) => PlaybookRule
  updatePlaybookRule: (ruleId: string, patch: Partial<PlaybookRule>) => void
  deletePlaybookRule: (ruleId: string) => void

  createProject: (name: string, description: string, color: string, icon: string) => Project
  updateProject: (projectId: string, patch: Partial<Project>) => void
  deleteProject: (projectId: string) => void
  restoreProject: (projectId: string) => void
  permanentlyDeleteProject: (projectId: string) => void
  purgeExpiredProjects: () => void
  createEpisode: (projectId: string, title: string) => Episode
  /** Creates one episode per title, numbered consecutively, as a single undoable step.
   * With a patternId, every episode in the batch is laid out to that pattern's beats. */
  createEpisodes: (projectId: string, titles: string[], patternId?: string) => Episode[]
  updateEpisode: (episodeId: string, patch: Partial<Episode>) => void
  /** Points a published post at one episode, clearing it from any other. Pass null to unlink. */
  linkEpisodeToPost: (episodeId: string | null, platform: 'instagram' | 'youtube', postId: string) => void
  duplicateEpisode: (episodeId: string) => Episode | undefined
  deleteEpisode: (episodeId: string) => void
  restoreEpisode: (episodeId: string) => void
  permanentlyDeleteEpisode: (episodeId: string) => void

  updateScene: (episodeId: string, sceneId: string, patch: Partial<Scene>) => void
  /** Encodes and stores an image in IndexedDB, or clears it when passed null. */
  setSceneImage: (episodeId: string, sceneId: string, src: string | null) => Promise<void>
  updateSceneDuration: (episodeId: string, sceneId: string, newDuration: number) => void
  updateSceneDialogue: (episodeId: string, sceneId: string, dialogue: string) => void
  setScenePace: (episodeId: string, sceneId: string, pace: SpeakingPace | undefined) => void
  setEpisodeDefaultPace: (episodeId: string, pace: SpeakingPace) => void
  reorderScenes: (episodeId: string, orderedSceneIds: string[]) => void
  addScene: (episodeId: string) => Scene
  duplicateScene: (episodeId: string, sceneId: string) => void
  deleteScene: (episodeId: string, sceneId: string) => void

  updateAsset: (assetId: string, patch: Partial<ProjectAsset>) => void
  addAsset: (asset: Omit<ProjectAsset, 'id'>) => void

  addSceneAsset: (episodeId: string, sceneId: string, asset: Omit<SceneAsset, 'id'>) => void
  updateSceneAsset: (episodeId: string, sceneId: string, assetId: string, patch: Partial<SceneAsset>) => void
  removeSceneAsset: (episodeId: string, sceneId: string, assetId: string) => void

  createPattern: (input: NewPatternInput) => Pattern
  updatePattern: (patternId: string, patch: Partial<Pattern>) => void
  deletePattern: (patternId: string) => void
  duplicatePattern: (patternId: string) => Pattern | undefined
  toggleFavoritePattern: (patternId: string) => void
  reorderPatternBeats: (patternId: string, orderedBeatIds: string[]) => void
  reorderPatterns: (orderedPatternIds: string[]) => void
  applyPatternToNewEpisode: (projectId: string, title: string, patternId: string) => Episode | undefined

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** Mirrors the history stacks into state. Those are module-level arrays, so
   * without this React never re-renders and the undo buttons always look live. */
  undoDepth: number
  redoDepth: number
}

interface DataSnapshot {
  projects: Project[]
  episodes: Episode[]
  assets: ProjectAsset[]
  patterns: Pattern[]
  playbook: PlaybookRule[]
}

const MAX_HISTORY = 60
const COALESCE_MS = 600
let undoHistory: DataSnapshot[] = []
let redoStack: DataSnapshot[] = []
let lastPushTime = 0
let isTimeTraveling = false

/** Publishes the module-level history depths into store state so the undo and
 * redo buttons can actually reflect whether they'd do anything. */
function syncHistoryDepth() {
  const next = { undoDepth: undoHistory.length, redoDepth: redoStack.length }
  const cur = useAppStore.getState()
  if (cur.undoDepth === next.undoDepth && cur.redoDepth === next.redoDepth) return
  useAppStore.setState(next)
}

type SetFn = (
  partial: AppState | Partial<AppState> | ((state: AppState) => AppState | Partial<AppState>),
  replace?: false,
) => void

function withUndo(
  config: (set: SetFn, get: () => AppState, api: unknown) => AppState,
): (set: SetFn, get: () => AppState, api: unknown) => AppState {
  return (set, get, api) => {
    const wrappedSet: SetFn = (partial, replace) => {
      if (!isTimeTraveling) {
        const now = Date.now()
        const state = get()
        if (now - lastPushTime > COALESCE_MS) {
          undoHistory.push({
            projects: state.projects,
            episodes: state.episodes,
            assets: state.assets,
            patterns: state.patterns,
            playbook: state.playbook,
          })
          if (undoHistory.length > MAX_HISTORY) undoHistory.shift()
          redoStack = []
        }
        lastPushTime = now
      }
      set(partial, replace)
      syncHistoryDepth()
    }
    return config(wrappedSet, get, api)
  }
}

export const PROJECT_TRASH_DAYS = 30

/** A project purge cascades to all its episodes regardless of their own deletedAt, so an
 * episode is only independently expired when its project isn't also being purged this pass. */
function findExpired(projects: Project[], episodes: Episode[]) {
  const cutoff = Date.now() - PROJECT_TRASH_DAYS * 24 * 60 * 60 * 1000
  const expiredProjectIds = new Set(
    projects.filter((p) => p.deletedAt && new Date(p.deletedAt).getTime() < cutoff).map((p) => p.id),
  )
  const expiredEpisodeIds = new Set(
    episodes
      .filter((ep) => ep.deletedAt && new Date(ep.deletedAt).getTime() < cutoff && !expiredProjectIds.has(ep.projectId))
      .map((ep) => ep.id),
  )
  return { expiredProjectIds, expiredEpisodeIds }
}

const MIN_SCENE_DURATION = 0.5

function recalcTimes(scenes: Scene[]): Scene[] {
  let cursor = 0
  return scenes.map((s, i) => {
    const duration = Math.max(MIN_SCENE_DURATION, s.end - s.start)
    const start = cursor
    const end = cursor + duration
    cursor = end
    return { ...s, index: i + 1, start, end }
  })
}

function totalLength(scenes: Scene[]): number {
  return scenes.at(-1)?.end ?? 0
}

function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

/** Duration derived from dialogue word count at the given pace, rounded to the nearest half-second.
 * Falls back to `currentDuration` when there's no dialogue — pace shouldn't shrink a visual-only scene. */
function paceDuration(dialogue: string, pace: SpeakingPace, currentDuration: number): number {
  const words = wordCount(dialogue)
  if (words === 0) return currentDuration
  const raw = words / PACE_WORDS_PER_SECOND[pace]
  return Math.max(MIN_SCENE_DURATION, Math.round(raw * 2) / 2)
}

/** Next lesson number for a project. Uses the highest number in use rather than a
 * count: counting breaks as soon as an episode is permanently deleted or purged,
 * handing a new episode a number an existing one already has. Soft-deleted
 * episodes are included so restoring one can't collide either. */
export function nextEpisodeNumber(episodes: Episode[], projectId: string): number {
  const highest = episodes
    .filter((e) => e.projectId === projectId)
    .reduce((max, e) => Math.max(max, e.number ?? 0), 0)
  return highest + 1
}

/** The shape of a brand-new episode, in one place. Both the single and the batch
 * creators go through here so a new field can never be added to one and missed
 * on the other. */
function buildEpisode(projectId: string, number: number, title: string): Episode {
  return {
    id: nextId('ep'),
    projectId,
    number,
    title,
    length: 30,
    status: 'Planning',
    completion: 0,
    estShootMinutes: 30,
    estEditMinutes: 60,
    format: '9:16',
    scenes: [
      {
        id: nextId('scene'),
        index: 1,
        start: 0,
        end: 3,
        purpose: 'Hook',
        emotion: 'Curious',
        dialogue: '',
        actorDirection: [],
        camera: { shotType: 'Medium', movement: 'Static', lens: '35mm', angle: 'Eye Level' },
        visual: '',
        onScreenText: { text: '', font: 'Inter', animation: 'Fade In', position: 'Bottom', duration: 2 },
        assets: [],
        audio: { music: '', sfx: [], voiceOver: '', mood: '', intensity: 40, volumeNotes: '' },
        retentionGoal: '',
        notes: '',
        tags: [],
        thumbnailIcon: 'clapperboard',
      },
    ],
  }
}

/** An episode laid out to a pattern's beats. Shared by the single and batch
 * creators for the same reason as [buildEpisode]: one definition, no drift. */
function buildPatternEpisode(projectId: string, episodeNumber: number, title: string, pattern: Pattern): Episode {
  const totalWeight = pattern.beats.reduce((sum, b) => sum + b.weight, 0) || 1
  let cursor = 0
  const scenes: Scene[] = pattern.beats.map((beat, i) => {
    // Round to the nearest half-second — matches the granularity scene
    // duration drags snap to elsewhere, and avoids floating-point noise
    // like 5.333333333333333s from the raw weight/totalWeight division.
    const rawDuration = (beat.weight / totalWeight) * pattern.estDurationSeconds
    const duration = Math.max(MIN_SCENE_DURATION, Math.round(rawDuration * 2) / 2)
    const start = Math.round(cursor * 2) / 2
    const end = start + duration
    cursor = end
    return {
      id: nextId('scene'),
      index: i + 1,
      start,
      end,
      purpose: beat.purpose,
      emotion: 'Curious',
      dialogue: '',
      actorDirection: [],
      camera: { shotType: 'Medium', movement: 'Static', lens: '35mm', angle: 'Eye Level' },
      visual: '',
      onScreenText: { text: '', font: 'Inter', animation: 'Fade In', position: 'Bottom', duration: 2 },
      assets: [],
      audio: { music: '', sfx: [], voiceOver: '', mood: '', intensity: 40, volumeNotes: '' },
      retentionGoal: beat.note,
      notes: '',
      tags: [],
      thumbnailIcon: 'clapperboard',
    }
  })
  const episode: Episode = {
    id: nextId('ep'),
    projectId,
    number: episodeNumber,
    title,
    length: totalLength(scenes),
    status: 'Planning',
    completion: 0,
    estShootMinutes: Math.round(scenes.length * 8),
    estEditMinutes: Math.round(scenes.length * 15),
    format: '9:16',
    scenes,
    patternId: pattern.id,
  }
  return episode
}

export const useAppStore = create<AppState>(withUndo((set, get) => ({
  projects: persisted?.projects ?? seedProjects,
  episodes: persisted?.episodes ?? seedEpisodes,
  assets: persisted?.assets ?? seedAssets,
  patterns: persisted?.patterns ?? seedPatterns,
  socialPosts: persisted?.socialPosts ?? [],
  playbook: persisted?.playbook ?? [],
  channelTags: persisted?.channelTags ?? {},
  retention: persisted?.retention ?? [],
  audienceVocabulary: persisted?.audienceVocabulary ?? [],
  mediaKit: persisted?.mediaKit ?? EMPTY_MEDIA_KIT,
  brands: persisted?.brands ?? [],
  opportunities: persisted?.opportunities ?? [],
  contacts: persisted?.contacts ?? [],

  loadWorkspace: (data) => {
    set(() => ({ ...data }))
  },

  updateMediaKit: (patch) => {
    set((state) => ({ mediaKit: { ...state.mediaKit, ...patch } }))
  },

  createBrand: (name) => {
    const brand: Brand = {
      id: nextId('brand'),
      name,
      category: '',
      website: '',
      contactName: '',
      contactEmail: '',
      notes: '',
      createdAt: new Date().toISOString(),
    }
    set((state) => ({ brands: [...state.brands, brand] }))
    return brand
  },

  updateBrand: (brandId, patch) => {
    set((state) => ({ brands: state.brands.map((b) => (b.id === brandId ? { ...b, ...patch } : b)) }))
  },

  deleteBrand: (brandId) => {
    // Soft, and it takes its opportunities with it — an orphaned deal with no
    // brand on the card is worse than losing both together.
    const now = new Date().toISOString()
    set((state) => ({
      brands: state.brands.map((b) => (b.id === brandId ? { ...b, deletedAt: now } : b)),
      opportunities: state.opportunities.map((o) =>
        o.brandId === brandId && !o.deletedAt ? { ...o, deletedAt: now } : o,
      ),
    }))
  },

  createOpportunity: (brandId, type) => {
    const now = new Date().toISOString()
    const opportunity: Opportunity = {
      id: nextId('opp'),
      brandId,
      type,
      stage: 'Research',
      title: '',
      concept: '',
      brandObservation: '',
      fit: '',
      audienceWhy: '',
      formats: [],
      valueOffered: [],
      fee: '',
      nextAction: '',
      nextActionDate: '',
      episodeIds: [],
      platforms: [],
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({ opportunities: [...state.opportunities, opportunity] }))
    return opportunity
  },

  updateOpportunity: (opportunityId, patch) => {
    set((state) => ({
      opportunities: state.opportunities.map((o) =>
        o.id === opportunityId ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o,
      ),
    }))
  },

  setOpportunityStage: (opportunityId, stage) => {
    set((state) => ({
      opportunities: state.opportunities.map((o) =>
        o.id === opportunityId ? { ...o, stage, updatedAt: new Date().toISOString() } : o,
      ),
    }))
  },

  deleteOpportunity: (opportunityId) => {
    const now = new Date().toISOString()
    set((state) => ({
      opportunities: state.opportunities.map((o) =>
        o.id === opportunityId ? { ...o, deletedAt: now } : o,
      ),
    }))
  },

  createContact: (brandId, patch) => {
    const contact: Contact = { ...emptyContact(brandId, nextId('contact')), ...patch }
    set((state) => ({ contacts: [...state.contacts, contact] }))
    return contact
  },

  updateContact: (contactId, patch) => {
    set((state) => ({
      contacts: state.contacts.map((c) => (c.id === contactId ? { ...c, ...patch } : c)),
    }))
  },

  deleteContact: (contactId) => {
    const now = new Date().toISOString()
    set((state) => ({
      contacts: state.contacts.map((c) => (c.id === contactId ? { ...c, deletedAt: now } : c)),
    }))
  },

  mergeContact: (keepId, dropId) => {
    const now = new Date().toISOString()
    set((state) => {
      const keep = state.contacts.find((c) => c.id === keepId)
      const drop = state.contacts.find((c) => c.id === dropId)
      if (!keep || !drop) return { contacts: state.contacts }
      const merged = mergeContacts(keep, drop)
      return {
        contacts: state.contacts.map((c) => {
          if (c.id === keepId) return merged
          if (c.id === dropId) return { ...c, deletedAt: now }
          // Anyone introduced by the folded record now points at the survivor,
          // so a warm-introduction path is never left dangling.
          return c.introducedById === dropId ? { ...c, introducedById: keepId } : c
        }),
      }
    })
  },

  addPlaybookRule: (rule) => {
    const created: PlaybookRule = { ...rule, id: nextId('rule'), createdAt: new Date().toISOString() }
    set((state) => ({ playbook: [...state.playbook, created] }))
    return created
  },

  updatePlaybookRule: (ruleId, patch) => {
    set((state) => ({
      playbook: state.playbook.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    }))
  },

  deletePlaybookRule: (ruleId) => {
    set((state) => ({ playbook: state.playbook.filter((r) => r.id !== ruleId) }))
  },

  setRetention: (snapshots) => {
    // Raw setState like setSocialPosts — refreshing analytics is background
    // housekeeping and has no business landing on the undo stack.
    useAppStore.setState({ retention: snapshots })
  },

  setAudienceVocabulary: (words) => {
    useAppStore.setState({ audienceVocabulary: words })
  },

  setChannelTag: (channelId, verdict) => {
    set((state) => {
      const next = { ...state.channelTags }
      if (verdict) next[channelId] = verdict
      else delete next[channelId]
      return { channelTags: next }
    })
  },

  setSocialPosts: (platform, posts) => {
    // Raw setState, not the undo-wrapped `set` — refreshing analytics is background
    // housekeeping and shouldn't push a phantom entry onto the undo stack.
    useAppStore.setState((state) => ({
      socialPosts: [...state.socialPosts.filter((p) => p.platform !== platform), ...posts],
    }))
  },


  updateProject: (projectId, patch) => {
    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? { ...p, ...patch } : p)),
    }))
  },

  createProject: (name, description, color, icon) => {
    const project: Project = {
      id: nextId('proj'),
      name,
      description,
      color,
      icon,
      episodeIds: [],
    }
    set((state) => ({ projects: [...state.projects, project] }))
    return project
  },

  deleteProject: (projectId) => {
    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? { ...p, deletedAt: new Date().toISOString() } : p)),
    }))
  },

  restoreProject: (projectId) => {
    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? { ...p, deletedAt: undefined } : p)),
    }))
  },

  permanentlyDeleteProject: (projectId) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== projectId),
      episodes: state.episodes.filter((ep) => ep.projectId !== projectId),
      assets: state.assets.filter((a) => a.projectId !== projectId),
    }))
  },

  purgeExpiredProjects: () => {
    const { expiredProjectIds, expiredEpisodeIds } = findExpired(get().projects, get().episodes)
    if (expiredProjectIds.size === 0 && expiredEpisodeIds.size === 0) return
    set((state) => ({
      projects: state.projects.filter((p) => !expiredProjectIds.has(p.id)),
      episodes: state.episodes.filter(
        (ep) => !expiredProjectIds.has(ep.projectId) && !expiredEpisodeIds.has(ep.id),
      ),
      assets: state.assets.filter((a) => !expiredProjectIds.has(a.projectId)),
    }))
  },

  createEpisode: (projectId, title) => {
    const episode = buildEpisode(projectId, nextEpisodeNumber(get().episodes, projectId), title)
    set((state) => ({
      episodes: [...state.episodes, episode],
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, episodeIds: [...p.episodeIds, episode.id] } : p,
      ),
    }))
    return episode
  },

  createEpisodes: (projectId, titles, patternId) => {
    if (titles.length === 0) return []
    // One `set` rather than a loop over createEpisode: the numbers come from a
    // single read of state, and the whole batch is one entry in the undo stack
    // instead of relying on the coalescing window to bundle N of them.
    const start = nextEpisodeNumber(get().episodes, projectId)
    // A pattern that has since been deleted falls back to blank episodes rather
    // than losing the batch — the titles are the part that was worth typing.
    const pattern = patternId ? get().patterns.find((p) => p.id === patternId) : undefined
    const made = titles.map((title, i) =>
      pattern
        ? buildPatternEpisode(projectId, start + i, title, pattern)
        : buildEpisode(projectId, start + i, title),
    )
    set((state) => ({
      episodes: [...state.episodes, ...made],
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, episodeIds: [...p.episodeIds, ...made.map((e) => e.id)] } : p,
      ),
      patterns: pattern
        ? state.patterns.map((p) => (p.id === pattern.id ? { ...p, usageCount: p.usageCount + made.length } : p))
        : state.patterns,
    }))
    return made
  },

  updateEpisode: (episodeId, patch) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => (ep.id === episodeId ? { ...ep, ...patch } : ep)),
    }))
  },

  linkEpisodeToPost: (episodeId, platform, postId) => {
    const field = platform === 'instagram' ? 'instagramMediaId' : 'youtubeVideoId'
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        const shouldHold = ep.id === episodeId
        const holdsNow = ep[field] === postId
        if (shouldHold === holdsNow) return ep
        return { ...ep, [field]: shouldHold ? postId : undefined }
      }),
    }))
  },

  duplicateEpisode: (episodeId) => {
    const source = get().episodes.find((e) => e.id === episodeId)
    if (!source) return undefined

    const episodeNumber = nextEpisodeNumber(get().episodes, source.projectId)
    const copy: Episode = {
      ...source,
      id: nextId('ep'),
      number: episodeNumber,
      title: `${source.title} (copy)`,
      status: 'Planning',
      completion: 0,
      // A copy is a fresh plan, not a second claim on the original's published post.
      instagramMediaId: undefined,
      youtubeVideoId: undefined,
      scheduledDate: undefined,
      deletedAt: undefined,
      scenes: source.scenes.map((s) => ({
        ...s,
        id: nextId('scene'),
        assets: s.assets.map((a) => ({ ...a, id: nextId('sceneasset') })),
        audio: { ...s.audio, sfx: s.audio.sfx.map((c) => ({ ...c, id: nextId('sfxcue') })) },
      })),
    }

    set((state) => ({
      episodes: [...state.episodes, copy],
      projects: state.projects.map((p) =>
        p.id === copy.projectId ? { ...p, episodeIds: [...p.episodeIds, copy.id] } : p,
      ),
    }))
    return copy
  },

  deleteEpisode: (episodeId) => {
    set((state) => ({
      episodes: state.episodes.map((ep) =>
        ep.id === episodeId ? { ...ep, deletedAt: new Date().toISOString() } : ep,
      ),
    }))
  },

  restoreEpisode: (episodeId) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => (ep.id === episodeId ? { ...ep, deletedAt: undefined } : ep)),
    }))
  },

  permanentlyDeleteEpisode: (episodeId) => {
    set((state) => ({
      episodes: state.episodes.filter((ep) => ep.id !== episodeId),
    }))
  },

  updateScene: (episodeId, sceneId, patch) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        return {
          ...ep,
          scenes: ep.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
        }
      }),
    }))
  },

  setSceneImage: async (episodeId, sceneId, src) => {
    if (src === null) {
      get().updateScene(episodeId, sceneId, { image: undefined, imageFileId: undefined })
      return
    }
    const { fileId, url } = await storeSceneImage(src)
    get().updateScene(episodeId, sceneId, { image: url, imageFileId: fileId })
  },

  updateSceneDuration: (episodeId, sceneId, newDuration) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        const idx = ep.scenes.findIndex((s) => s.id === sceneId)
        if (idx === -1) return ep
        const clamped = Math.max(MIN_SCENE_DURATION, Math.round(newDuration * 2) / 2)
        const oldDuration = ep.scenes[idx].end - ep.scenes[idx].start
        const delta = clamped - oldDuration
        if (delta === 0) return ep
        const scenes = ep.scenes.map((s, i) => {
          if (i < idx) return s
          if (i === idx) return { ...s, end: s.end + delta }
          return { ...s, start: s.start + delta, end: s.end + delta }
        })
        return { ...ep, scenes, length: totalLength(scenes) }
      }),
    }))
  },

  updateSceneDialogue: (episodeId, sceneId, dialogue) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        const idx = ep.scenes.findIndex((s) => s.id === sceneId)
        if (idx === -1) return ep
        const scene = ep.scenes[idx]
        const pace = scene.pace ?? ep.defaultPace ?? DEFAULT_SPEAKING_PACE
        const oldDuration = scene.end - scene.start
        const delta = paceDuration(dialogue, pace, oldDuration) - oldDuration
        const scenes = ep.scenes.map((s, i) => {
          if (i < idx) return s
          if (i === idx) return { ...s, dialogue, end: s.end + delta }
          return { ...s, start: s.start + delta, end: s.end + delta }
        })
        return { ...ep, scenes, length: totalLength(scenes) }
      }),
    }))
  },

  setScenePace: (episodeId, sceneId, pace) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        const idx = ep.scenes.findIndex((s) => s.id === sceneId)
        if (idx === -1) return ep
        const scene = ep.scenes[idx]
        const effectivePace = pace ?? ep.defaultPace ?? DEFAULT_SPEAKING_PACE
        const oldDuration = scene.end - scene.start
        const delta = paceDuration(scene.dialogue, effectivePace, oldDuration) - oldDuration
        const scenes = ep.scenes.map((s, i) => {
          if (i < idx) return s
          if (i === idx) return { ...s, pace, end: s.end + delta }
          return { ...s, start: s.start + delta, end: s.end + delta }
        })
        return { ...ep, scenes, length: totalLength(scenes) }
      }),
    }))
  },

  setEpisodeDefaultPace: (episodeId, pace) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        let cursor = 0
        const scenes = ep.scenes.map((s) => {
          const oldDuration = s.end - s.start
          const duration = s.pace ? oldDuration : paceDuration(s.dialogue, pace, oldDuration)
          const start = cursor
          const end = start + duration
          cursor = end
          return { ...s, start, end }
        })
        return { ...ep, defaultPace: pace, scenes, length: totalLength(scenes) }
      }),
    }))
  },

  reorderScenes: (episodeId, orderedSceneIds) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        const bySceneId = new Map(ep.scenes.map((s) => [s.id, s]))
        const reordered = orderedSceneIds.map((id) => bySceneId.get(id)!).filter(Boolean)
        const scenes = recalcTimes(reordered)
        return { ...ep, scenes, length: totalLength(scenes) }
      }),
    }))
  },

  addScene: (episodeId) => {
    const episode = get().episodes.find((e) => e.id === episodeId)
    const lastEnd = episode?.scenes.at(-1)?.end ?? 0
    const newScene: Scene = {
      id: nextId('scene'),
      index: (episode?.scenes.length ?? 0) + 1,
      start: lastEnd,
      end: lastEnd + 3,
      purpose: 'Example',
      emotion: 'Curious',
      dialogue: '',
      actorDirection: [],
      camera: { shotType: 'Medium', movement: 'Static', lens: '35mm', angle: 'Eye Level' },
      visual: '',
      onScreenText: { text: '', font: 'Inter', animation: 'Fade In', position: 'Bottom', duration: 2 },
      assets: [],
      audio: { music: '', sfx: [], voiceOver: '', mood: '', intensity: 40, volumeNotes: '' },
      retentionGoal: '',
      notes: '',
      tags: [],
      thumbnailIcon: 'clapperboard',
    }
    set((state) => ({
      episodes: state.episodes.map((ep) =>
        ep.id === episodeId
          ? { ...ep, scenes: [...ep.scenes, newScene], length: totalLength([...ep.scenes, newScene]) }
          : ep,
      ),
    }))
    return newScene
  },

  duplicateScene: (episodeId, sceneId) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        const source = ep.scenes.find((s) => s.id === sceneId)
        if (!source) return ep
        const copy: Scene = { ...source, id: nextId('scene') }
        const idx = ep.scenes.findIndex((s) => s.id === sceneId)
        const scenes = recalcTimes([...ep.scenes.slice(0, idx + 1), copy, ...ep.scenes.slice(idx + 1)])
        return { ...ep, scenes, length: totalLength(scenes) }
      }),
    }))
  },

  deleteScene: (episodeId, sceneId) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        const scenes = recalcTimes(ep.scenes.filter((s) => s.id !== sceneId))
        return { ...ep, scenes, length: totalLength(scenes) }
      }),
    }))
  },

  updateAsset: (assetId, patch) => {
    set((state) => ({
      assets: state.assets.map((a) => (a.id === assetId ? { ...a, ...patch } : a)),
    }))
  },

  addAsset: (asset) => {
    set((state) => ({ assets: [...state.assets, { ...asset, id: nextId('asset') }] }))
  },

  addSceneAsset: (episodeId, sceneId, asset) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        return {
          ...ep,
          scenes: ep.scenes.map((s) =>
            s.id === sceneId ? { ...s, assets: [...s.assets, { ...asset, id: nextId('sceneasset') }] } : s,
          ),
        }
      }),
    }))
  },

  updateSceneAsset: (episodeId, sceneId, assetId, patch) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        return {
          ...ep,
          scenes: ep.scenes.map((s) =>
            s.id === sceneId
              ? { ...s, assets: s.assets.map((a) => (a.id === assetId ? { ...a, ...patch } : a)) }
              : s,
          ),
        }
      }),
    }))
  },

  removeSceneAsset: (episodeId, sceneId, assetId) => {
    set((state) => ({
      episodes: state.episodes.map((ep) => {
        if (ep.id !== episodeId) return ep
        return {
          ...ep,
          scenes: ep.scenes.map((s) =>
            s.id === sceneId ? { ...s, assets: s.assets.filter((a) => a.id !== assetId) } : s,
          ),
        }
      }),
    }))
  },

  createPattern: (input) => {
    const customCount = get().patterns.filter((p) => !p.isBuiltIn).length
    const pattern: Pattern = {
      id: nextId('pattern'),
      name: input.name,
      description: input.description,
      category: input.category,
      creator: 'You',
      isBuiltIn: false,
      isFavorite: false,
      order: customCount,
      beats: input.beats.map((b) => ({ ...b, id: nextId('beat') })),
      estDurationSeconds: input.estDurationSeconds,
      usageCount: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    }
    set((state) => ({ patterns: [...state.patterns, pattern] }))
    return pattern
  },

  updatePattern: (patternId, patch) => {
    set((state) => ({
      patterns: state.patterns.map((p) => (p.id === patternId ? { ...p, ...patch } : p)),
    }))
  },

  deletePattern: (patternId) => {
    // Keep the entry if it doesn't match, OR if it does match but is a
    // built-in — built-ins can't be deleted, only duplicated and edited.
    set((state) => ({
      patterns: state.patterns.filter((p) => p.id !== patternId || p.isBuiltIn),
    }))
  },

  duplicatePattern: (patternId) => {
    const source = get().patterns.find((p) => p.id === patternId)
    if (!source) return undefined
    const customCount = get().patterns.filter((p) => !p.isBuiltIn).length
    const copy: Pattern = {
      ...source,
      id: nextId('pattern'),
      name: `${source.name} Copy`,
      creator: 'You',
      isBuiltIn: false,
      isFavorite: false,
      order: customCount,
      beats: source.beats.map((b) => ({ ...b, id: nextId('beat') })),
      usageCount: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    }
    set((state) => ({ patterns: [...state.patterns, copy] }))
    return copy
  },

  toggleFavoritePattern: (patternId) => {
    set((state) => ({
      patterns: state.patterns.map((p) => (p.id === patternId ? { ...p, isFavorite: !p.isFavorite } : p)),
    }))
  },

  reorderPatternBeats: (patternId, orderedBeatIds) => {
    set((state) => ({
      patterns: state.patterns.map((p) => {
        if (p.id !== patternId) return p
        const byId = new Map(p.beats.map((b) => [b.id, b]))
        const beats = orderedBeatIds.map((id) => byId.get(id)!).filter(Boolean)
        return { ...p, beats }
      }),
    }))
  },

  reorderPatterns: (orderedPatternIds) => {
    set((state) => {
      const orderOf = new Map(orderedPatternIds.map((id, i) => [id, i]))
      return {
        patterns: state.patterns.map((p) => (orderOf.has(p.id) ? { ...p, order: orderOf.get(p.id)! } : p)),
      }
    })
  },

  applyPatternToNewEpisode: (projectId, title, patternId) => {
    const pattern = get().patterns.find((p) => p.id === patternId)
    if (!pattern) return undefined
    const episode = buildPatternEpisode(projectId, nextEpisodeNumber(get().episodes, projectId), title, pattern)
    set((state) => ({
      episodes: [...state.episodes, episode],
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, episodeIds: [...p.episodeIds, episode.id] } : p,
      ),
      patterns: state.patterns.map((p) => (p.id === patternId ? { ...p, usageCount: p.usageCount + 1 } : p)),
    }))
    return episode
  },

  undo: () => {
    const prev = undoHistory.pop()
    if (!prev) return
    const state = get()
    redoStack.push({ projects: state.projects, episodes: state.episodes, assets: state.assets, patterns: state.patterns, playbook: state.playbook })
    isTimeTraveling = true
    set(prev)
    isTimeTraveling = false
    lastPushTime = 0
    syncHistoryDepth()
  },

  redo: () => {
    const next = redoStack.pop()
    if (!next) return
    const state = get()
    undoHistory.push({ projects: state.projects, episodes: state.episodes, assets: state.assets, patterns: state.patterns, playbook: state.playbook })
    isTimeTraveling = true
    set(next)
    isTimeTraveling = false
    lastPushTime = 0
    syncHistoryDepth()
  },

  canUndo: () => undoHistory.length > 0,
  canRedo: () => redoStack.length > 0,
  undoDepth: 0,
  redoDepth: 0,
})))

let persistTimeout: ReturnType<typeof setTimeout> | null = null
useAppStore.subscribe((state) => {
  if (persistTimeout) clearTimeout(persistTimeout)
  setPersistStatus('saving')
  persistTimeout = setTimeout(() => {
    savePersistedData({
      projects: state.projects,
      episodes: state.episodes,
      assets: state.assets,
      patterns: state.patterns,
      socialPosts: state.socialPosts,
      playbook: state.playbook,
      channelTags: state.channelTags,
      retention: state.retention,
      audienceVocabulary: state.audienceVocabulary,
      mediaKit: state.mediaKit,
      brands: state.brands,
      opportunities: state.opportunities,
      contacts: state.contacts,
    })
  }, 300)
})

// A restored scene only carries a stable `musicFileId` (the blob URL from
// last session is dead on arrival). Re-resolve each one from IndexedDB and
// patch the fresh blob URL back in — via the store's raw setState, so this
// startup housekeeping never lands on the undo stack. Anything left in
// IndexedDB that no scene references anymore (music removed, scene deleted)
// gets swept up at the same time so it doesn't accumulate forever.
export async function hydrateStoredFiles() {
  // Step 1 — migrate any scene image still held as base64 from before images moved
  // to IndexedDB. Runs once; after the next save the data URL is gone from storage.
  const legacy: { episodeId: string; sceneId: string; dataUrl: string }[] = []
  useAppStore.getState().episodes.forEach((ep) => {
    ep.scenes.forEach((s) => {
      if (!s.imageFileId && s.image?.startsWith('data:')) {
        legacy.push({ episodeId: ep.id, sceneId: s.id, dataUrl: s.image })
      }
    })
  })

  for (const item of legacy) {
    try {
      const { fileId, url } = await storeSceneImage(item.dataUrl)
      useAppStore.setState((state) => ({
        episodes: state.episodes.map((ep) =>
          ep.id !== item.episodeId
            ? ep
            : {
                ...ep,
                scenes: ep.scenes.map((s) =>
                  s.id === item.sceneId ? { ...s, image: url, imageFileId: fileId } : s,
                ),
              },
        ),
      }))
    } catch (err) {
      // Keep the original data URL rather than dropping the creator's image.
      console.error('Could not migrate a scene image into IndexedDB', err)
    }
  }

  // Step 2 — collect everything still referenced, so the prune below never
  // deletes a live file. Images must be included or they vanish on next launch.
  const fileIds = new Set<string>()
  useAppStore.getState().episodes.forEach((ep) => {
    ep.scenes.forEach((s) => {
      if (s.audio.musicFileId) fileIds.add(s.audio.musicFileId)
      if (s.imageFileId) fileIds.add(s.imageFileId)
    })
  })

  void pruneUnusedFiles(fileIds)
  if (fileIds.size === 0) return

  // Step 3 — resolve ids back to blob: URLs for this session.
  const resolved = new Map<string, string>()
  await Promise.all(
    Array.from(fileIds).map(async (id) => {
      const url = await resolveFileUrl(id)
      if (url) resolved.set(id, url)
    }),
  )
  if (resolved.size === 0) return

  useAppStore.setState((state) => ({
    episodes: state.episodes.map((ep) => ({
      ...ep,
      scenes: ep.scenes.map((s) => {
        const musicUrl = s.audio.musicFileId ? resolved.get(s.audio.musicFileId) : undefined
        const imageUrl = s.imageFileId ? resolved.get(s.imageFileId) : undefined
        if (!musicUrl && !imageUrl) return s
        return {
          ...s,
          ...(imageUrl ? { image: imageUrl } : {}),
          ...(musicUrl ? { audio: { ...s.audio, musicFileUrl: musicUrl } } : {}),
        }
      }),
    })),
  }))
}
void hydrateStoredFiles()

// Projects and episodes sitting in Recently Deleted longer than PROJECT_TRASH_DAYS are purged
// once per launch, via raw setState so this startup housekeeping never lands on the undo stack.
;(function purgeExpiredOnStartup() {
  const state = useAppStore.getState()
  const { expiredProjectIds, expiredEpisodeIds } = findExpired(state.projects, state.episodes)
  if (expiredProjectIds.size === 0 && expiredEpisodeIds.size === 0) return
  useAppStore.setState((s) => ({
    projects: s.projects.filter((p) => !expiredProjectIds.has(p.id)),
    episodes: s.episodes.filter((ep) => !expiredProjectIds.has(ep.projectId) && !expiredEpisodeIds.has(ep.id)),
    assets: s.assets.filter((a) => !expiredProjectIds.has(a.projectId)),
  }))
})()
