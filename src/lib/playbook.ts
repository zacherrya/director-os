/**
 * Evaluates the creator's own rules against a draft.
 *
 * These findings rank above the built-in craft checks wherever they conflict:
 * a rule the creator wrote after watching their own videos fail beats a general
 * principle, and the app should defer to it rather than argue.
 */

import type { Episode, PlaybookRule, Project } from './types'
import type { DraftFinding } from './draftCheck'

/** Rules that apply to a given project: its own, plus the global ones. */
export function rulesForProject(rules: PlaybookRule[], projectId: string | undefined): PlaybookRule[] {
  return rules.filter((r) => r.enabled && (r.projectId === undefined || r.projectId === projectId))
}

/** Human-readable summary of what a rule enforces, for the Playbook list. */
export function describeRule(rule: PlaybookRule, projects: Project[]): string {
  const scope =
    rule.projectId === undefined
      ? 'All projects'
      : (projects.find((p) => p.id === rule.projectId)?.name ?? 'Unknown project')

  switch (rule.kind) {
    case 'hookMaxSeconds':
      return `${scope} · Hook within ${rule.value}s`
    case 'runtimeMaxSeconds':
      return `${scope} · Under ${rule.value}s`
    case 'runtimeMinSeconds':
      return `${scope} · At least ${rule.value}s`
    case 'requireEndBeat':
      return `${scope} · Ends on ${rule.target}`
    case 'requireBeat':
      return `${scope} · Includes ${rule.target}`
    case 'preferHookType':
      return `${scope} · ${rule.target} hook`
    case 'reminder':
      return `${scope} · Checklist only`
  }
}

export function checkPlaybook(episode: Episode, rules: PlaybookRule[]): DraftFinding[] {
  const out: DraftFinding[] = []
  const scenes = episode.scenes
  if (scenes.length === 0) return out

  const hook = scenes.find((s) => s.purpose === 'Hook') ?? scenes[0]
  const lastScene = scenes[scenes.length - 1]

  for (const rule of rules) {
    const base = { id: `rule-${rule.id}`, source: 'playbook' as const }

    switch (rule.kind) {
      case 'hookMaxSeconds': {
        const length = hook.end - hook.start
        if (rule.value !== undefined && length > rule.value) {
          out.push({
            ...base,
            severity: 'flag',
            title: rule.text,
            detail: `Your hook runs ${length}s against your own ${rule.value}s rule.`,
            sceneId: hook.id,
          })
        }
        break
      }
      case 'runtimeMaxSeconds':
        if (rule.value !== undefined && episode.length > rule.value) {
          out.push({
            ...base,
            severity: 'flag',
            title: rule.text,
            detail: `This draft is ${episode.length}s against your own ${rule.value}s ceiling.`,
          })
        }
        break
      case 'runtimeMinSeconds':
        if (rule.value !== undefined && episode.length < rule.value) {
          out.push({
            ...base,
            severity: 'note',
            title: rule.text,
            detail: `This draft is ${episode.length}s against your own ${rule.value}s floor.`,
          })
        }
        break
      case 'requireEndBeat':
        if (rule.target && lastScene.purpose !== rule.target) {
          out.push({
            ...base,
            severity: 'flag',
            title: rule.text,
            detail: `This ends on ${lastScene.purpose}, not ${rule.target}.`,
            sceneId: lastScene.id,
          })
        }
        break
      case 'requireBeat':
        if (rule.target && !scenes.some((s) => s.purpose === rule.target)) {
          out.push({
            ...base,
            severity: 'flag',
            title: rule.text,
            detail: `No ${rule.target} beat in this draft.`,
          })
        }
        break
      case 'preferHookType':
        if (rule.target && hook.hookType !== rule.target) {
          out.push({
            ...base,
            severity: 'note',
            title: rule.text,
            detail: hook.hookType
              ? `This hook is tagged ${hook.hookType}, not ${rule.target}.`
              : `This hook has no type set. Tag it in the hook workshop to check this rule.`,
            sceneId: hook.id,
          })
        }
        break
      case 'reminder':
        out.push({
          ...base,
          severity: 'note',
          title: rule.text,
          detail: 'From your playbook — check this yourself; it is not something the app can measure.',
        })
        break
    }
  }

  return out
}
