/**
 * Counts AI calls so the creator can see what they're spending before the bill
 * arrives.
 *
 * Deliberately counts rather than estimates dollars: only OpenAI knows the real
 * figure, model pricing changes, and a made-up number next to a currency symbol
 * would be trusted more than it deserves. Counts plus a link to the real usage
 * page is the honest version.
 */

const KEY = 'director-os-ai-usage'

export type AiFeature = 'image' | 'analysis' | 'hook' | 'assistant' | 'caption'

export const FEATURE_LABEL: Record<AiFeature, string> = {
  image: 'Storyboard stills',
  analysis: 'Performance analyses',
  hook: 'Hook workshops',
  assistant: 'Assistant replies',
  caption: 'Caption drafts',
}

export interface UsageRecord {
  /** 'YYYY-MM' → feature → count */
  months: Record<string, Partial<Record<AiFeature, number>>>
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function read(): UsageRecord {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { months: {} }
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && parsed.months ? parsed : { months: {} }
  } catch {
    return { months: {} }
  }
}

export function recordAiUse(feature: AiFeature) {
  try {
    const rec = read()
    const month = currentMonth()
    const bucket = rec.months[month] ?? {}
    bucket[feature] = (bucket[feature] ?? 0) + 1
    rec.months[month] = bucket
    localStorage.setItem(KEY, JSON.stringify(rec))
  } catch {
    // Usage counting must never break the feature it's counting.
  }
}

export function usageThisMonth(): { feature: AiFeature; count: number }[] {
  const bucket = read().months[currentMonth()] ?? {}
  return (Object.keys(FEATURE_LABEL) as AiFeature[]).map((f) => ({ feature: f, count: bucket[f] ?? 0 }))
}

export function totalThisMonth(): number {
  return usageThisMonth().reduce((n, u) => n + u.count, 0)
}

export function resetUsage() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}
