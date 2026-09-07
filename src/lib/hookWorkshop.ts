/**
 * Rewrites the opening line — the one sentence with the most leverage in a
 * short-form video.
 *
 * The variants are generated against the creator's own best-performing hooks
 * where those exist, so the suggestions drift toward their voice rather than
 * toward generic engagement-bait. With no history it still works, just on
 * craft principles alone.
 */

import { fetch } from '@tauri-apps/plugin-http'
import { getOpenAiKey } from './credentials'
import type { Episode, HookType, Scene } from './types'
import { HOOK_TYPE_OPTIONS } from './types'
import { engagementRate } from './social'
import type { LinkedPost } from './draftCheck'
import { recordAiUse } from './aiUsage'

export interface HookVariant {
  line: string
  type: HookType
  why: string
}

export interface HookCritique {
  /** What is weak about the current line. Empty when there is no line yet. */
  critique: string
  variants: HookVariant[]
}

/** The creator's best-performing opening lines, to steer voice and structure. */
function referenceHooks(history: LinkedPost[]): { line: string; engagement: number }[] {
  return history
    .map((h) => {
      const hook = h.episode.scenes.find((s) => s.purpose === 'Hook') ?? h.episode.scenes[0]
      const rate = engagementRate(h.post)
      if (!hook || !hook.dialogue.trim() || rate === null) return null
      return { line: hook.dialogue.trim().slice(0, 200), engagement: Math.round(rate * 10) / 10 }
    })
    .filter((v): v is { line: string; engagement: number } => v !== null)
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5)
}

const SYSTEM_PROMPT = `You rewrite opening lines for short-form video. The first two seconds decide how far a video travels, so the opening line has to earn the next one.

Rules:
- Every variant must be sayable out loud in under 3 seconds. Count the words.
- Be specific to the subject matter given. Never produce generic engagement-bait ("Wait for it", "You won't believe").
- No line may promise something the video's beats do not deliver.
- If reference hooks from the creator's best posts are provided, match their voice and register. Do not imitate other creators.
- Vary the approach across the variants — do not return five questions.

Classify each variant as exactly one of: ${HOOK_TYPE_OPTIONS.join(', ')}.

Return ONLY JSON of this shape:
{
  "critique": "one or two sentences on what is weak about the current opening line, or \\"\\" if there is no line yet",
  "variants": [{ "line": "the spoken line", "type": "one of the allowed types", "why": "one short sentence on why this opening works" }]
}

Return 4 variants.`

export async function workshopHook(
  scene: Scene,
  episode: Episode,
  history: LinkedPost[],
): Promise<HookCritique> {
  const key = getOpenAiKey()
  if (!key) throw new Error('No OpenAI API key configured. Add one in Settings.')

  const refs = referenceHooks(history)
  const context = {
    currentHookLine: scene.dialogue.trim() || null,
    hookDurationSeconds: scene.end - scene.start,
    videoTitle: episode.title,
    emotionWanted: scene.emotion,
    whatViewerSees: scene.visual || null,
    beatsThatFollow: episode.scenes.slice(1).map((s) => `${s.purpose}: ${s.dialogue.slice(0, 90)}`),
    yourBestPerformingHooks: refs.length > 0 ? refs : 'none linked yet — use craft principles only',
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.9,
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
    throw new Error(message || `Hook workshop failed (${res.status}).`)
  }

  recordAiUse('hook')
  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('OpenAI returned an empty response.')

  let parsed: { critique?: unknown; variants?: unknown }
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('OpenAI returned malformed JSON.')
  }

  const variants = Array.isArray(parsed.variants)
    ? parsed.variants
        .filter((v): v is HookVariant => !!v && typeof (v as HookVariant).line === 'string')
        .map((v) => ({
          line: v.line,
          type: HOOK_TYPE_OPTIONS.includes(v.type) ? v.type : 'Claim',
          why: typeof v.why === 'string' ? v.why : '',
        }))
    : []

  return {
    critique: typeof parsed.critique === 'string' ? parsed.critique : '',
    variants,
  }
}
