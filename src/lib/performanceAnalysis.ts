/**
 * Turns published performance data into a plan for what to make next.
 *
 * The thing that makes this worth doing inside Director OS rather than in any
 * analytics dashboard: for posts linked to an episode, we can send the actual
 * scene structure — the beat order, the hook line, the pacing — alongside the
 * numbers. That lets the model reason about *why* something worked in terms the
 * user can act on in the timeline, instead of "post more Reels".
 */

import { fetch } from '@tauri-apps/plugin-http'
import { getOpenAiKey } from './credentials'
import type { Episode, PlaybookRule } from './types'
import { engagementRate, PLATFORM_LABEL, type PostPerformance } from './social'
import { diagnoseExit } from './retention'
import { recordAiUse } from './aiUsage'

export interface NextVideoIdea {
  title: string
  hook: string
  why: string
}

export interface PerformanceInsights {
  summary: string
  working: string[]
  notWorking: string[]
  nextVideos: NextVideoIdea[]
}

/** Only the fields worth spending tokens on, with nulls dropped so the model is
 * never asked to reason about a metric the platform didn't report. */
function describePost(post: PostPerformance, episode: Episode | undefined) {
  const rate = engagementRate(post)
  const metrics: Record<string, number> = {}
  const put = (k: string, v: number | null) => {
    if (v !== null) metrics[k] = Math.round(v * 100) / 100
  }
  put('views', post.views)
  put('reach', post.reach)
  put('likes', post.likes)
  put('comments', post.comments)
  put('shares', post.shares)
  put('saves', post.saves)
  put('engagementRatePercent', rate)
  put('avgWatchTimeSeconds', post.avgWatchTime)
  put('durationSeconds', post.duration)

  const record: Record<string, unknown> = {
    title: post.title,
    platform: PLATFORM_LABEL[post.platform],
    format: post.format,
    publishedAt: post.publishedAt?.slice(0, 10),
    metrics,
  }

  if (episode) {
    record.directorOsPlan = {
      beats: episode.scenes.map((s) => `${s.index}. ${s.purpose} (${s.start}-${s.end}s)`),
      sceneCount: episode.scenes.length,
      plannedLengthSeconds: episode.length,
      hookLine: episode.scenes.find((s) => s.purpose === 'Hook')?.dialogue?.slice(0, 200) || null,
      pace: episode.defaultPace ?? null,
    }

    const exit = diagnoseExit(post.avgWatchTime, episode)
    if (exit && !exit.watchedToEnd) {
      const scene = episode.scenes.find((s) => s.id === exit.sceneId)
      record.averageExit = {
        scene: `${exit.sceneIndex}. ${exit.purpose}`,
        secondsIntoScene: Math.round(exit.secondsIntoScene * 10) / 10,
        percentOfPlanWatched: Math.round(exit.fractionWatched * 100),
        lineBeingSpoken: scene?.dialogue?.slice(0, 200) || null,
      }
    }
  }
  return record
}

const SYSTEM_PROMPT = `You are a short-form video strategist reviewing a creator's recent published performance.

Rules:
- Ground every claim in the numbers you were given. Cite specific posts by title and specific figures.
- Never invent a metric that isn't present. Some platforms do not report shares, saves or reach; treat those as unmeasured, not as zero.
- Sample sizes here are small. Say when a pattern is suggestive rather than proven; do not present noise as a finding.
- Some posts include "directorOsPlan": the scene-by-scene structure the creator planned in their app. When present, tie performance to that structure (beat order, hook wording, length, pacing) so the advice is actionable in their editor.
- Some posts include "averageExit": the scene the average viewer was watching when they left, and the line being spoken there. Treat this as the single most useful diagnostic you have — say which beat to cut, shorten or rewrite, and quote the line that is losing them. Note that it is an average exit point, not a full retention curve, so do not describe it as a cliff or claim to know the shape of the drop-off.
- Proposed next videos must be concrete and specific to this creator's subject matter — not generic advice like "post consistently" or "use trending audio".

Return ONLY JSON matching exactly this shape:
{
  "summary": "2-3 sentences on the overall read",
  "working": ["specific thing that is working, with evidence", "..."],
  "notWorking": ["specific thing that is underperforming, with evidence", "..."],
  "nextVideos": [{ "title": "concrete video title", "hook": "the actual opening line to say", "why": "which data point motivates this" }]
}

Give 2-4 items in "working" and "notWorking", and 3-5 in "nextVideos".`

export async function analyzePerformance(
  posts: PostPerformance[],
  episodesByPostId: Map<string, Episode>,
  playbook: PlaybookRule[] = [],
): Promise<PerformanceInsights> {
  const key = getOpenAiKey()
  if (!key) throw new Error('No OpenAI API key configured. Add one in Settings.')
  if (posts.length === 0) throw new Error('There are no posts to analyse yet.')

  const payload = posts.map((p) => describePost(p, episodesByPostId.get(p.id)))

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `Here are the ${payload.length} most recent posts, newest first:`,
            JSON.stringify(payload, null, 2),
            playbook.length > 0
              ? `\nThe creator's own playbook rules, which they have chosen to work to:\n${playbook
                  .map((r) => `- ${r.text}`)
                  .join('\n')}\nRespect these in your suggestions. If the data genuinely contradicts one, say so plainly and cite the posts — a rule that no longer holds is worth knowing about.`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = (body as { error?: { message?: string } })?.error?.message
    if (res.status === 401) throw new Error('OpenAI rejected the API key. Check it in Settings.')
    if (res.status === 429) throw new Error(message || 'Rate limit or quota exceeded on your OpenAI account.')
    throw new Error(message || `Analysis failed (${res.status}).`)
  }

  recordAiUse('analysis')
  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('OpenAI returned an empty analysis.')

  let parsed: Partial<PerformanceInsights>
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('OpenAI returned malformed analysis JSON.')
  }

  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    working: strings(parsed.working),
    notWorking: strings(parsed.notWorking),
    nextVideos: Array.isArray(parsed.nextVideos)
      ? parsed.nextVideos
          .filter((v): v is NextVideoIdea => !!v && typeof (v as NextVideoIdea).title === 'string')
          .map((v) => ({ title: v.title, hook: v.hook ?? '', why: v.why ?? '' }))
      : [],
  }
}
