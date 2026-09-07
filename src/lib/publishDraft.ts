/**
 * The post itself — the thing that actually goes out, as opposed to the script
 * that gets filmed.
 *
 * Two platforms that look similar and aren't. An Instagram caption is one block
 * of text whose *first line* is the whole game, because everything after it sits
 * behind "more". A YouTube upload is a title doing the work of a thumbnail's
 * partner, plus a description whose opening lines are what search shows. Writing
 * one and pasting it into both is how you get a caption that reads like a
 * description and a description that reads like nothing.
 *
 * The limits below are the real truncation points, not style preferences, so the
 * counters can tell you when something will actually be cut off rather than when
 * it merely feels long.
 */

import type { SocialPlatform } from './social'

export interface PublishDraft {
  /** YouTube title. Unused on Instagram, which has no title field. */
  title: string
  /** The Instagram caption, or the YouTube description. */
  body: string
  /** Instagram only — where hashtags usually go to keep the caption clean. */
  firstComment: string
  tags: string[]
}

export interface EpisodePublishing {
  instagram?: PublishDraft
  youtube?: PublishDraft
}

export function emptyDraft(): PublishDraft {
  return { title: '', body: '', firstComment: '', tags: [] }
}

export interface FieldLimit {
  /** Where the platform stops showing text, not where it stops accepting it. */
  visible: number
  /** The hard cap, where input is refused. */
  max: number
  label: string
}

export interface PlatformSpec {
  platform: SocialPlatform
  label: string
  /** What the body field is actually called on that platform. */
  bodyLabel: string
  title?: FieldLimit
  body: FieldLimit
  /** The opening stretch that shows before the reader has to tap. */
  firstLine: FieldLimit
  hasFirstComment: boolean
  maxTags: number
  /** How many hashtags actually help, as opposed to how many are allowed. */
  suggestedTags: number
}

export const PLATFORM_SPECS: Record<SocialPlatform, PlatformSpec> = {
  instagram: {
    platform: 'instagram',
    label: 'Instagram',
    bodyLabel: 'Caption',
    body: { visible: 125, max: 2200, label: 'caption' },
    firstLine: { visible: 125, max: 125, label: 'first line' },
    hasFirstComment: true,
    maxTags: 30,
    suggestedTags: 5,
  },
  youtube: {
    platform: 'youtube',
    label: 'YouTube',
    bodyLabel: 'Description',
    title: { visible: 60, max: 100, label: 'title' },
    body: { visible: 157, max: 5000, label: 'description' },
    firstLine: { visible: 157, max: 157, label: 'opening line' },
    hasFirstComment: false,
    maxTags: 15,
    suggestedTags: 8,
  },
}

export function firstLineOf(body: string): string {
  return body.split('\n').find((l) => l.trim().length > 0)?.trim() ?? ''
}

/** Hashtags normalised to lowercase, deduped, without the leading hash. */
export function normaliseTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export function parseTags(raw: string): string[] {
  const out: string[] = []
  for (const piece of raw.split(/[\s,]+/)) {
    const tag = normaliseTag(piece)
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out
}

export type DraftIssueLevel = 'flag' | 'note'

export interface DraftIssue {
  field: 'title' | 'body' | 'firstComment' | 'tags'
  level: DraftIssueLevel
  message: string
}

/**
 * What will actually go wrong when this posts.
 *
 * Deliberately short on style opinions and long on mechanics: a caption whose
 * hook falls past the truncation point is a fact, whereas "this caption could be
 * punchier" is noise the writer already knows.
 */
export function checkDraft(draft: PublishDraft, spec: PlatformSpec): DraftIssue[] {
  const out: DraftIssue[] = []

  if (spec.title) {
    const title = draft.title.trim()
    if (title.length === 0) {
      out.push({ field: 'title', level: 'flag', message: 'No title yet.' })
    } else if (title.length > spec.title.max) {
      out.push({
        field: 'title',
        level: 'flag',
        message: `${title.length} characters — ${spec.label} refuses anything over ${spec.title.max}.`,
      })
    } else if (title.length > spec.title.visible) {
      out.push({
        field: 'title',
        level: 'note',
        message: `Past ${spec.title.visible} characters the end gets clipped in most places this appears. Put the payoff earlier.`,
      })
    }
  }

  const body = draft.body.trim()
  if (body.length === 0) {
    out.push({ field: 'body', level: 'flag', message: `No ${spec.bodyLabel.toLowerCase()} yet.` })
  } else {
    if (body.length > spec.body.max) {
      out.push({
        field: 'body',
        level: 'flag',
        message: `${body.length} characters — over the ${spec.body.max} limit.`,
      })
    }
    const opener = firstLineOf(body)
    if (opener.length > spec.firstLine.visible) {
      out.push({
        field: 'body',
        level: 'note',
        message: `Your opening line runs ${opener.length} characters. Only about ${spec.firstLine.visible} show before a reader has to tap, so it is cut mid-thought.`,
      })
    }
    if (/^https?:\/\//i.test(opener)) {
      out.push({
        field: 'body',
        level: 'flag',
        message: 'The one line everyone sees is a URL. Lead with the promise and move the link down.',
      })
    }
  }

  if (draft.tags.length > spec.maxTags) {
    out.push({
      field: 'tags',
      level: 'flag',
      message: `${draft.tags.length} tags — ${spec.label} allows ${spec.maxTags}.`,
    })
  }

  // Hashtags buried in an Instagram caption push the readable part further from
  // the top; the first comment exists precisely so they don't have to.
  if (spec.hasFirstComment && (body.match(/#\w+/g)?.length ?? 0) >= 3) {
    out.push({
      field: 'body',
      level: 'note',
      message: 'Three or more hashtags inside the caption. Moving them to the first comment keeps the caption readable.',
    })
  }

  return out
}

/** Everything that gets pasted, assembled the way the platform expects it. */
export function assembleForCopy(draft: PublishDraft, spec: PlatformSpec): string {
  if (spec.platform === 'youtube') {
    return draft.body.trim()
  }
  const tags = draft.tags.map((t) => `#${t}`).join(' ')
  // On Instagram the tags ride in the first comment when there is one, so the
  // caption copies clean.
  return spec.hasFirstComment && draft.firstComment.trim()
    ? draft.body.trim()
    : [draft.body.trim(), tags].filter(Boolean).join('\n\n')
}
