/**
 * Drafts the caption or description from the episode's own script.
 *
 * Everything it needs is already in the app: the beats, the spoken lines, the
 * creator's playbook rules, and — where the audience analysis has run — the
 * words that the channels YouTube actually files them next to put in their
 * titles. Feeding that vocabulary in is what stops the output reading like
 * generic caption filler and starts it reading like the neighbourhood the
 * creator is trying to join.
 *
 * It writes a draft, never the final post. The editor beside it is the point.
 */

import { fetch } from '@tauri-apps/plugin-http'
import { getOpenAiKey } from './credentials'
import { recordAiUse } from './aiUsage'
import type { Episode, PlaybookRule } from './types'
import type { SocialPlatform } from './social'
import { PLATFORM_SPECS, parseTags, type PublishDraft } from './publishDraft'

const SYSTEM_PROMPT = `You write the post that carries a short-form video — not the script, which already exists.

Hard rules:
- Never promise anything the video's beats do not deliver. You are given the beats; stay inside them.
- The first line is the whole job. On Instagram roughly 125 characters show before "more"; on YouTube roughly 157 characters of the description show in search. Put the hook there, finished, not trailing into a clause that gets cut.
- Write in the creator's register, taken from their spoken lines. Do not switch to marketing voice.
- No engagement-bait ("comment YES", "you won't believe"), no emoji walls, no hashtag stuffing inside the body.
- Hashtags go in the tags array, lowercase, no # symbol, specific to the subject. Broad tags like "fashion" or "viral" are worthless; prefer the ones a person actually searching this topic would use.

Platform differences you must respect:
- Instagram: no title. One caption. Hashtags belong in the first comment, which you also write.
- YouTube: a title that works beside a thumbnail and stays under 60 characters, then a description whose opening two lines restate the promise before any links or boilerplate.

Return ONLY JSON of this shape:
{
  "title": "YouTube title, or \\"\\" for Instagram",
  "body": "the caption or description",
  "firstComment": "Instagram first comment holding the hashtags, or \\"\\" for YouTube",
  "tags": ["lowercase", "without", "hashes"]
}`

export interface CaptionContext {
  episode: Episode
  platform: SocialPlatform
  rules: PlaybookRule[]
  /** Title words the on-target neighbourhood uses, from the audience analysis. */
  neighbourhoodVocabulary?: string[]
  /** Captions from the creator's better-performing posts, to anchor voice. */
  referenceCaptions?: string[]
}

export async function writeCaption(ctx: CaptionContext): Promise<PublishDraft> {
  const key = getOpenAiKey()
  if (!key) throw new Error('No OpenAI API key configured. Add one in Settings.')

  const { episode, platform, rules } = ctx
  const spec = PLATFORM_SPECS[platform]

  const context = {
    platform: spec.label,
    videoTitle: episode.title,
    runtimeSeconds: episode.length,
    beats: episode.scenes.map((s) => ({
      purpose: s.purpose,
      says: s.dialogue.trim().slice(0, 220) || null,
      shows: s.visual.trim().slice(0, 120) || null,
    })),
    firstLineVisibleCharacters: spec.firstLine.visible,
    titleLimit: spec.title?.visible ?? null,
    wantHashtags: spec.suggestedTags,
    yourRules: rules.filter((r) => r.enabled).map((r) => r.text).slice(0, 12),
    wordsThatWorkInYourNeighbourhood:
      ctx.neighbourhoodVocabulary && ctx.neighbourhoodVocabulary.length > 0
        ? ctx.neighbourhoodVocabulary
        : null,
    yourBetterPerformingCaptions:
      ctx.referenceCaptions && ctx.referenceCaptions.length > 0 ? ctx.referenceCaptions : null,
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.8,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(context, null, 2) },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = (body as { error?: { message?: string } })?.error?.message
    if (res.status === 401) throw new Error('OpenAI rejected the API key. Check it in Settings.')
    if (res.status === 429) throw new Error(message || 'Rate limit or quota exceeded on your OpenAI account.')
    throw new Error(message || `Caption draft failed (${res.status}).`)
  }

  recordAiUse('caption')
  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('OpenAI returned an empty response.')

  let parsed: { title?: unknown; body?: unknown; firstComment?: unknown; tags?: unknown }
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('OpenAI returned malformed JSON.')
  }

  const rawTags = Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === 'string') : []

  return {
    // Instagram has no title field; drop anything the model returned for it
    // rather than letting it silently become dead state on the episode.
    title: spec.title && typeof parsed.title === 'string' ? parsed.title.trim() : '',
    body: typeof parsed.body === 'string' ? parsed.body.trim() : '',
    firstComment:
      spec.hasFirstComment && typeof parsed.firstComment === 'string' ? parsed.firstComment.trim() : '',
    tags: parseTags(rawTags.join(' ')).slice(0, spec.maxTags),
  }
}
