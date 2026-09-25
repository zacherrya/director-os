import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { buildHistory, runDraftCheck, type DraftFinding } from '../../lib/draftCheck'
import { rulesForProject } from '../../lib/playbook'
import { analyzeEdit, type EditInsight } from '../../lib/editor/insights'
import { episodeAsCut, type EditProject } from '../../lib/editor/model'
import type { Episode } from '../../lib/types'

/**
 * What to change, in two groups.
 *
 * "This cut" is the craft read of the edit itself — the half-second audit,
 * masked jump cuts, captions that can't be read in time. "From your results" is
 * the existing draft check, run not against the script but against the episode
 * as it was actually cut: beats re-timed to where their footage landed, runtime
 * as rendered. So the playbook, the retention habits and the post history judge
 * the video you are about to publish, not the one you planned.
 */

const DOT: Record<'flag' | 'note' | 'good', string> = { flag: '#e0787d', note: '#d3a75c', good: '#6bb15a' }

const SOURCE_LABEL: Record<DraftFinding['source'], string> = {
  playbook: 'Your playbook',
  retention: 'Your retention',
  history: 'Your results',
  posts: 'Your posts',
  craft: 'Craft',
}

interface Props {
  project: EditProject
  episode: Episode
  onCommit: (next: EditProject) => void
  onSeek: (t: number) => void
}

export function EditorInsights({ project, episode, onCommit, onSeek }: Props) {
  const episodes = useAppStore((s) => s.episodes)
  const socialPosts = useAppStore((s) => s.socialPosts)
  const playbook = useAppStore((s) => s.playbook)
  const retention = useAppStore((s) => s.retention)

  const edit = useMemo(() => analyzeEdit(project, episode), [project, episode])

  const measured = useMemo(() => {
    const { episode: cut, beatsCovered } = episodeAsCut(episode, project)
    if (!beatsCovered) return null
    const result = runDraftCheck(
      cut,
      buildHistory(episodes, socialPosts),
      rulesForProject(playbook, episode.projectId),
      retention,
      socialPosts,
    )
    return { findings: result.findings, beatsCovered, historySize: result.historySize, retentionSize: result.retentionSize }
  }, [project, episode, episodes, socialPosts, playbook, retention])

  if (!project.clips.length) {
    return (
      <div className="p-4 text-[11.5px] leading-relaxed text-ink-faint">
        Insights appear as soon as there is footage on the timeline — the half-second audit, jump cuts, caption timing,
        and your own playbook and retention results, run against the cut itself.
      </div>
    )
  }

  const row = (i: EditInsight) => (
    <li key={i.id} className="border-b border-border-soft px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-2">
        <span className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: DOT[i.severity] }} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium leading-snug text-ink">{i.title}</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">{i.detail}</p>
          {(i.fix || i.at !== undefined) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {i.fix && (
                <button
                  onClick={() => onCommit(i.fix!.apply(project))}
                  className="rounded-md border border-gold/50 bg-gold-soft px-2 py-1 text-[10.5px] font-medium text-gold transition hover:border-gold"
                >
                  {i.fix.label}
                </button>
              )}
              {i.at !== undefined && (
                <button
                  onClick={() => onSeek(i.at!)}
                  className="rounded-md border border-border px-2 py-1 font-mono text-[10.5px] text-ink-dim transition hover:text-ink"
                >
                  Go to {i.at.toFixed(1)}s
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )

  return (
    <div className="pb-4">
      <div className="px-4 pb-1 pt-3 text-[9.5px] font-semibold uppercase tracking-[1.1px] text-ink-faint">This cut</div>
      {edit.length ? (
        <ul>{edit.map(row)}</ul>
      ) : (
        <p className="px-4 py-2 text-[11.5px] text-ink-faint">Nothing to flag.</p>
      )}

      <div className="mt-2 flex items-center gap-1.5 px-4 pb-1 pt-3 text-[9.5px] font-semibold uppercase tracking-[1.1px] text-ink-faint">
        <Sparkles size={10} className="text-gold" /> From your results
      </div>
      {!measured ? (
        <p className="px-4 py-2 text-[11px] leading-relaxed text-ink-faint">
          Tag clips with their script beats and your playbook, retention and post history will judge this cut.
        </p>
      ) : (
        <>
          <p className="px-4 pb-1 text-[10.5px] text-ink-faint">
            Judged on the {measured.beatsCovered} of {episode.scenes.length} beats with footage, as cut.
          </p>
          <ul>
            {measured.findings.map((f) => (
              <li key={f.id} className="border-b border-border-soft px-4 py-3 last:border-b-0">
                <div className="flex items-start gap-2">
                  <span className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: DOT[f.severity] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[12px] font-medium leading-snug text-ink">{f.title}</span>
                    </div>
                    <span className="mt-0.5 inline-block rounded-full border border-border px-1.5 py-px text-[9px] text-ink-faint">
                      {SOURCE_LABEL[f.source]}
                    </span>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">{f.detail}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {measured.findings.length === 0 && <p className="px-4 py-2 text-[11.5px] text-ink-faint">Nothing flagged.</p>}
        </>
      )}
    </div>
  )
}
