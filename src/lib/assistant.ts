/**
 * The assistant behind the Ask AI panel.
 *
 * It is given the episode currently open, the creator's playbook, and their
 * published performance where it exists — so answers are about *this* video
 * rather than short-form video in general. Without that context it would be a
 * worse version of a chat window the user already has elsewhere.
 */

import { fetch } from '@tauri-apps/plugin-http'
import { getOpenAiKey } from './credentials'
import type { Episode, PlaybookRule, Project } from './types'
import { buildHistory, type LinkedPost } from './draftCheck'
import { engagementRate } from './social'
import { recordAiUse } from './aiUsage'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantContext {
  project?: Project
  episode?: Episode
  playbook: PlaybookRule[]
  history: LinkedPost[]
}

const SYSTEM_PROMPT = `You are the writing partner inside Director OS, a short-form video planning app.

You are given the episode the creator currently has open, their playbook rules, and their published results where available.

Rules:
- Answer about the specific episode in front of you. Refer to its scenes by number and beat name.
- Keep answers tight. This is a side panel, not an essay — a few sentences, or a short list.
- When you suggest dialogue, write the actual line, not a description of one.
- Respect the creator's playbook rules. If you think the data contradicts one, say so and cite the numbers.
- Never invent performance figures. If you weren't given numbers, say the data isn't linked yet.
- If asked something you cannot know, say so plainly instead of guessing.`

function describeContext(ctx: AssistantContext): string {
  const parts: string[] = []

  if (ctx.project) parts.push(`Project: ${ctx.project.name} — ${ctx.project.description}`)

  if (ctx.episode) {
    const ep = ctx.episode
    parts.push(
      `Episode open: "${ep.title}" (${ep.length}s, ${ep.format}, status ${ep.status})\n` +
        ep.scenes
          .map(
            (s) =>
              `  ${s.index}. ${s.purpose} [${s.start}-${s.end}s] ${s.emotion}` +
              (s.dialogue ? `\n     line: "${s.dialogue.slice(0, 160)}"` : '\n     (no line yet)') +
              (s.visual ? `\n     visual: ${s.visual.slice(0, 120)}` : ''),
          )
          .join('\n'),
    )
  } else {
    parts.push('No episode is open right now.')
  }

  if (ctx.playbook.length > 0) {
    parts.push(`Playbook rules:\n${ctx.playbook.map((r) => `- ${r.text}`).join('\n')}`)
  }

  if (ctx.history.length > 0) {
    parts.push(
      `Published results for episodes they've linked:\n` +
        ctx.history
          .map((h) => {
            const rate = engagementRate(h.post)
            return `- "${h.episode.title}" → ${h.post.views ?? '?'} views${
              rate !== null ? `, ${rate.toFixed(1)}% engagement` : ''
            }${h.post.avgWatchTime !== null ? `, ${h.post.avgWatchTime.toFixed(1)}s avg watch` : ''}`
          })
          .join('\n'),
    )
  }

  return parts.join('\n\n')
}

export function buildAssistantContext(
  episodes: Episode[],
  socialPosts: Parameters<typeof buildHistory>[1],
  playbook: PlaybookRule[],
  project?: Project,
  episode?: Episode,
): AssistantContext {
  return { project, episode, playbook, history: buildHistory(episodes, socialPosts) }
}

export async function askAssistant(
  messages: AssistantMessage[],
  ctx: AssistantContext,
): Promise<string> {
  const key = getOpenAiKey()
  if (!key) throw new Error('No OpenAI API key configured. Add one in Settings.')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.8,
      max_tokens: 700,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: `Current context:\n\n${describeContext(ctx)}` },
        ...messages,
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = (body as { error?: { message?: string } })?.error?.message
    if (res.status === 401) throw new Error('OpenAI rejected the API key. Check it in Settings.')
    if (res.status === 429) throw new Error(message || 'Rate limit or quota exceeded on your OpenAI account.')
    throw new Error(message || `Request failed (${res.status}).`)
  }

  recordAiUse('assistant')
  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('OpenAI returned an empty response.')
  return content.trim()
}
