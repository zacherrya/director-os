import type { EpisodePublishing } from './publishDraft'

/** 'Ready' is the cut that exists but hasn't gone out yet — the gap between
 * finishing an edit and posting it, which is where most videos actually sit. */
export type EpisodeStatus = 'Planning' | 'Filming' | 'Editing' | 'Ready' | 'Published'

export type ScenePurpose =
  | 'Hook'
  | 'Problem'
  | 'False Belief'
  | 'It Isn\'t'
  | 'Lesson'
  | 'Truth'
  | 'Example'
  | 'Transformation'
  | 'Homework'
  | 'CTA'
  | 'Teaser'

export const PURPOSE_OPTIONS: ScenePurpose[] = [
  'Hook',
  'Problem',
  'False Belief',
  'It Isn\'t',
  'Lesson',
  'Truth',
  'Example',
  'Transformation',
  'Homework',
  'CTA',
  'Teaser',
]

export const PURPOSE_COLOR: Record<ScenePurpose, string> = {
  Hook: '#d3a75c',
  Problem: '#c96a4a',
  'False Belief': '#c9863f',
  'It Isn\'t': '#b6598f',
  Lesson: '#4f8fc0',
  Truth: '#4fa8a0',
  Example: '#4fa889',
  Transformation: '#8a7bd8',
  Homework: '#6bb15a',
  CTA: '#c4494f',
  Teaser: '#c77fb0',
}

export type Emotion =
  | 'Curious'
  | 'Inspired'
  | 'Confused'
  | 'Excited'
  | 'Satisfied'
  | 'Realization'
  | 'Reassured'
  | 'Determined'

export const EMOTION_OPTIONS: Emotion[] = [
  'Curious',
  'Inspired',
  'Confused',
  'Excited',
  'Satisfied',
  'Realization',
  'Reassured',
  'Determined',
]

export type ShotType = 'Close Up' | 'Medium' | 'Wide' | 'Top Down' | 'POV' | 'Drone'
export const SHOT_TYPE_OPTIONS: ShotType[] = ['Close Up', 'Medium', 'Wide', 'Top Down', 'POV', 'Drone']

// Terminology follows standard cinematography usage (dolly/push-in vs pull-out,
// pan/tilt as in-place rotation, truck as lateral translation, crane/pedestal as
// vertical translation, handheld vs steadicam as unstabilized vs stabilized motion).
export type CameraMovement = 'Static' | 'Pan' | 'Tilt' | 'Push In' | 'Pull Out' | 'Truck' | 'Crane' | 'Handheld' | 'Steadicam'
export const MOVEMENT_OPTIONS: CameraMovement[] = [
  'Static',
  'Pan',
  'Tilt',
  'Push In',
  'Pull Out',
  'Truck',
  'Crane',
  'Handheld',
  'Steadicam',
]

export type CameraAngle = 'Eye Level' | 'Low Angle' | 'High Angle' | 'Dutch Tilt'
export const ANGLE_OPTIONS: CameraAngle[] = ['Eye Level', 'Low Angle', 'High Angle', 'Dutch Tilt']

export const LENS_OPTIONS = ['24mm', '35mm', '50mm', '85mm'] as const

export type AssetKind = 'AI Video' | 'AI Image' | 'Animation' | 'Motion Graphic' | 'Prop'
export const ASSET_KIND_OPTIONS: AssetKind[] = ['AI Video', 'AI Image', 'Animation', 'Motion Graphic', 'Prop']

export type AssetStatus = 'Generated' | 'Approved' | 'Needs Revision' | 'Pending'

export interface SceneAsset {
  id: string
  kind: AssetKind
  prompt: string
  status: AssetStatus
  referenceImage?: string
}

export interface OnScreenText {
  text: string
  font: string
  animation: string
  position: 'Top' | 'Center' | 'Bottom'
  duration: number
}

export interface CameraDirection {
  shotType: ShotType
  movement: CameraMovement
  lens: (typeof LENS_OPTIONS)[number]
  angle: CameraAngle
  notes?: string
}

export interface SceneSfxCue {
  id: string
  name: string
  /** Seconds from the start of the scene when this SFX should fire. */
  offset: number
  /** Optional cap on how long it plays, in seconds. Omit to let it play its natural length. */
  duration?: number
}

export interface AudioDirection {
  music: string
  /** Playable URL for the uploaded track — a blob: URL resolved at runtime from `musicFileId`. Never trust this across reloads. */
  musicFileUrl?: string
  /** Stable IndexedDB key for the uploaded file's bytes. This is what actually survives a reload/relaunch. */
  musicFileId?: string
  musicTrimStart?: number
  /** Seconds from the start of the scene where the music block starts. Defaults to 0. */
  musicOffset?: number
  /** How long the music block spans, in seconds. Defaults to the rest of the scene. */
  musicDuration?: number
  sfx: SceneSfxCue[]
  voiceOver: string
  mood: string
  intensity: number
  volumeNotes: string
}

export type SpeakingPace = 'Slow' | 'Conversational' | 'Fast'

export const SPEAKING_PACE_OPTIONS: { value: SpeakingPace; label: string; wpm: string }[] = [
  { value: 'Slow', label: 'Slow / Narration', wpm: '110–130 WPM' },
  { value: 'Conversational', label: 'Conversational / Normal', wpm: '140–160 WPM' },
  { value: 'Fast', label: 'Fast / Energetic', wpm: '170–190 WPM' },
]

export const PACE_WORDS_PER_SECOND: Record<SpeakingPace, number> = {
  Slow: 2,
  Conversational: 2.5,
  Fast: 3,
}

export const DEFAULT_SPEAKING_PACE: SpeakingPace = 'Conversational'

/** How a hook opens. Tracked so the app can eventually learn which kind works
 * for this creator, rather than assuming the general wisdom applies to them. */
export type HookType = 'Question' | 'Accusation' | 'Claim' | 'Story' | 'Visual' | 'Contradiction'

export const HOOK_TYPE_OPTIONS: HookType[] = [
  'Question',
  'Accusation',
  'Claim',
  'Story',
  'Visual',
  'Contradiction',
]

export interface Scene {
  id: string
  index: number
  start: number
  end: number
  purpose: ScenePurpose
  emotion: Emotion
  dialogue: string
  /** Overrides the episode's defaultPace for this scene's duration calculation. Undefined inherits the episode default. */
  pace?: SpeakingPace
  actorDirection: string[]
  camera: CameraDirection
  visual: string
  onScreenText: OnScreenText
  assets: SceneAsset[]
  audio: AudioDirection
  retentionGoal: string
  /** Planned % of viewers still watching by the end of this scene (0-100). Undefined until the creator drags a point on the retention curve. */
  retentionTarget?: number
  notes: string
  tags: string[]
  thumbnailIcon: string
  /** Displayable image URL for this session — a blob: URL resolved from `imageFileId`.
   * Never persisted: base64 here is what used to blow the localStorage quota. */
  image?: string
  /** Stable IndexedDB key for the image bytes. This is what survives a reload. */
  imageFileId?: string
  /** Only meaningful on a Hook scene. Set from the hook workshop. */
  hookType?: HookType
}

export interface Episode {
  id: string
  projectId: string
  number: number
  title: string
  length: number
  status: EpisodeStatus
  /** Absolute path to the finished cut for this episode, revealed from the calendar. */
  cutPath?: string
  /** The caption / title / description that actually goes out, per platform. */
  publishing?: EpisodePublishing
  /** Read back from Meta after publishing — a media id is not a post URL. */
  instagramPermalink?: string
  /** Local HH:MM to go with `scheduledDate`, making it a real moment. */
  scheduledTime?: string
  /** ISO 8601 moment YouTube will publish an already-uploaded video. */
  youtubePublishAt?: string
  /** Which scene's still stands in as the thumbnail in the post preview. */
  thumbnailSceneId?: string
  completion: number
  estShootMinutes: number
  estEditMinutes: number
  format: '9:16' | '1:1' | '16:9'
  /** Default speaking pace used to derive scene durations from dialogue word count. Undefined falls back to DEFAULT_SPEAKING_PACE. */
  defaultPace?: SpeakingPace
  scenes: Scene[]
  /** Planned publish date on the Content Calendar, as 'YYYY-MM-DD'. Undefined means unscheduled. */
  scheduledDate?: string
  /** ISO timestamp when this episode was soft-deleted. Undefined means active. Purged permanently 30 days after this. */
  deletedAt?: string
  /** Pattern this episode was built from, when it was created by applying one.
   * Episodes built by hand have none — the scoreboard also matches on beat
   * structure so those still count. */
  patternId?: string
  /** Instagram media id this episode was published as, linked on the Analytics page. */
  instagramMediaId?: string
  /** YouTube video id this episode was published as, linked on the Analytics page. */
  youtubeVideoId?: string
}

export type AssetCategory =
  | 'AI Videos'
  | 'Images'
  | 'Music'
  | 'SFX'
  | 'Fonts'
  | 'Logos'
  | 'Icons'
  | 'Props'
  | 'Wardrobe'

export const ASSET_CATEGORIES: AssetCategory[] = [
  'AI Videos',
  'Images',
  'Music',
  'SFX',
  'Fonts',
  'Logos',
  'Icons',
  'Props',
  'Wardrobe',
]

export interface ProjectAsset {
  id: string
  projectId: string
  category: AssetCategory
  name: string
  status: AssetStatus
  linkedScenes: string[]
  notes: string
}

/**
 * A rule the creator has earned and wants enforced on future drafts.
 *
 * The measurable kinds are checked automatically by the draft check. `reminder`
 * exists because plenty of real lessons ("open on the wardrobe, never on me")
 * can't be expressed as a threshold, and losing those to a rigid schema would
 * defeat the point — they're surfaced as a checklist instead of silently dropped.
 */
export type PlaybookRuleKind =
  | 'hookMaxSeconds'
  | 'runtimeMaxSeconds'
  | 'runtimeMinSeconds'
  | 'requireEndBeat'
  | 'requireBeat'
  | 'preferHookType'
  | 'reminder'

export const PLAYBOOK_RULE_KINDS: { value: PlaybookRuleKind; label: string; needs: 'seconds' | 'beat' | 'hookType' | 'none' }[] = [
  { value: 'hookMaxSeconds', label: 'Hook lands within…', needs: 'seconds' },
  { value: 'runtimeMaxSeconds', label: 'Runtime stays under…', needs: 'seconds' },
  { value: 'runtimeMinSeconds', label: 'Runtime is at least…', needs: 'seconds' },
  { value: 'requireEndBeat', label: 'Must end on beat…', needs: 'beat' },
  { value: 'requireBeat', label: 'Must include beat…', needs: 'beat' },
  { value: 'preferHookType', label: 'Hook should be type…', needs: 'hookType' },
  { value: 'reminder', label: 'Reminder (not auto-checked)', needs: 'none' },
]

export interface PlaybookRule {
  id: string
  kind: PlaybookRuleKind
  /** Threshold for the seconds-based kinds. */
  value?: number
  /** ScenePurpose for beat kinds, HookType for preferHookType. */
  target?: string
  /** How the rule reads to the creator. Always shown verbatim. */
  text: string
  /** A rule promoted from real results carries more weight than one guessed at. */
  origin: 'manual' | 'insight' | 'suggested'
  /** Undefined applies the rule to every project. */
  projectId?: string
  createdAt: string
  enabled: boolean
}

export interface Project {
  id: string
  name: string
  description: string
  color: string
  icon: string
  episodeIds: string[]
  /** Where finished cuts for this project live on disk, opened from the calendar. */
  assetsFolder?: string
  /** ISO timestamp when this project was soft-deleted. Undefined means active. Purged permanently 30 days after this. */
  deletedAt?: string
}

export type PatternCategory =
  | 'Educational'
  | 'Storytime'
  | 'Listicle'
  | 'Transformation'
  | 'Product Demo'
  | 'Myth Bust'
  | 'Q&A'
  | 'Behind the Scenes'

export const PATTERN_CATEGORY_OPTIONS: PatternCategory[] = [
  'Educational',
  'Storytime',
  'Listicle',
  'Transformation',
  'Product Demo',
  'Myth Bust',
  'Q&A',
  'Behind the Scenes',
]

/** One beat in a story structure — a purpose (reusing the same beats scenes
 * already carry) plus a relative weight that sizes it in the visual timeline
 * and, when the pattern is applied, becomes its share of the target duration.
 * Patterns hold no dialogue/visuals/camera direction — just the shape. */
export interface PatternBeat {
  id: string
  purpose: ScenePurpose
  note: string
  weight: number
}

export interface Pattern {
  id: string
  name: string
  description: string
  category: PatternCategory
  creator: string
  isBuiltIn: boolean
  isFavorite: boolean
  /** Manual sort position among the creator's own patterns. Built-ins ignore this. */
  order: number
  beats: PatternBeat[]
  estDurationSeconds: number
  usageCount: number
  createdAt: string
}

/** The parts of a media kit that can't be derived from analytics — everything
 * else on the kit is read from real published performance. */
export interface MediaKitProfile {
  displayName: string
  /** The one line under the name on the cover. */
  tagline: string
  contactEmail: string
  location: string
  /** The longer statement of what the work is and who it is for. */
  positioning: string
  /** Who actually watches — the part no analytics endpoint can answer. */
  audienceNote: string
  /** The shapes a collaboration can take. Omitted from the kit when empty. */
  collaborationNote: string
  /** Platform media ids pinned to the kit. Empty means "the best few, by views". */
  featuredPostIds: string[]
}
