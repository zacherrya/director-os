import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Episode } from '../../lib/types'
import { useAppStore } from '../../store/appStore'
import { buildHistory, MIN_HISTORY, runDraftCheck, type DraftFinding } from '../../lib/draftCheck'
import { PLATFORM_LABEL } from '../../lib/social'
import { rulesForProject } from '../../lib/playbook'
import { useDebounced } from '../../lib/useDebounced'
import { Check, ChevronDown, Icon } from '../Icon'

const SEVERITY_STYLE = {
  flag: { color: '#c96a4a', label: 'Fix' },
  note: { color: '#d3a75c', label: 'Consider' },
  good: { color: '#6bb15a', label: 'Working' },
} as const

function FindingRow({ finding, onJump }: { finding: DraftFinding; onJump: (sceneId: string) => void }) {
  const style = SEVERITY_STYLE[finding.severity]
  return (
    <div className="flex gap-2.5 rounded-lg border border-border-soft bg-surface-2 px-3 py-2.5">
      <span
        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: style.color }}
        title={style.label}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-medium text-ink">{finding.title}</span>
          {finding.source === 'history' && (
            <span
              className="rounded bg-gold-soft px-1 py-px text-[9.5px] font-medium tracking-wide text-gold uppercase"
              title={
                finding.platform
                  ? `Measured on your ${PLATFORM_LABEL[finding.platform]} posts — the two accounts are compared separately, never pooled`
                  : 'Derived from your own published results, not a general rule'
              }
            >
              {finding.platform ? PLATFORM_LABEL[finding.platform] : 'your data'}
            </span>
          )}
          {finding.source === 'retention' && (
            <span
              className="rounded px-1 py-px text-[9.5px] font-medium tracking-wide uppercase"
              style={{ backgroundColor: '#4f8fc022', color: '#4f8fc0' }}
              title="From your YouTube retention curves — a habit seen across several videos, not one result"
            >
              {finding.platform ? `${PLATFORM_LABEL[finding.platform]} retention` : 'retention'}
            </span>
          )}
          {finding.source === 'playbook' && (
            <span
              className="rounded bg-gold-soft px-1 py-px text-[9.5px] font-medium tracking-wide text-gold uppercase"
              title="A rule from your playbook"
            >
              your rule
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-dim">{finding.detail}</p>
        {finding.sceneId && (
          <button
            onClick={() => onJump(finding.sceneId!)}
            className="mt-1.5 text-[11px] font-medium text-ink-faint transition hover:text-gold"
          >
            Open that scene →
          </button>
        )}
      </div>
    </div>
  )
}

export function DraftCheckPanel({
  episode,
  onSelectScene,
}: {
  episode: Episode
  onSelectScene: (sceneId: string) => void
}) {
  const episodes = useAppStore((s) => s.episodes)
  const socialPosts = useAppStore((s) => s.socialPosts)
  const playbook = useAppStore((s) => s.playbook)
  const retention = useAppStore((s) => s.retention)
  const [open, setOpen] = useState(false)

  // The episode object changes identity on every keystroke, so without this the
  // whole check re-ran per character typed. 400ms is below noticing, and the
  // findings are advisory rather than live-critical.
  const settledEpisode = useDebounced(episode, 400)

  const result = useMemo(() => {
    const history = buildHistory(episodes, socialPosts)
    const rules = rulesForProject(playbook, settledEpisode.projectId)
    return runDraftCheck(settledEpisode, history, rules, retention, socialPosts)
  }, [settledEpisode, episodes, socialPosts, playbook, retention])

  const flags = result.findings.filter((f) => f.severity === 'flag').length
  const notes = result.findings.filter((f) => f.severity === 'note').length
  const clean = result.findings.length === 0

  return (
    <div className="border-b border-border-soft bg-surface/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-8 py-2.5 transition hover:bg-surface-2/50"
      >
        <div className="flex items-center gap-2.5">
          <Icon name="wand-2" size={13} className="text-ink-faint" />
          <span className="text-[12.5px] font-medium text-ink-dim">Draft check</span>
          {clean ? (
            <span className="flex items-center gap-1 text-[11.5px] text-[#6bb15a]">
              <Check size={12} />
              Nothing flagged
            </span>
          ) : (
            <span className="flex items-center gap-2 text-[11.5px]">
              {flags > 0 && <span className="text-[#c96a4a]">{flags} to fix</span>}
              {flags > 0 && notes > 0 && <span className="text-ink-faint">·</span>}
              {notes > 0 && <span className="text-[#d3a75c]">{notes} to consider</span>}
            </span>
          )}
          {result.historyByPlatform.some((p) => !p.ready) && (
            <span className="text-[11px] text-ink-faint">
              ·{' '}
              {result.historyByPlatform
                // "4/3" reads like a mistake; once an account is over the line
                // the threshold stops being the interesting number.
                .map((p) => `${PLATFORM_LABEL[p.platform]} ${p.ready ? p.size : `${p.size}/${MIN_HISTORY}`}`)
                .join(' · ')}{' '}
              linked
            </span>
          )}
          {result.retentionSize > 0 && (
            <span className="text-[11px] text-ink-faint">
              · {result.retentionSize} retention curve{result.retentionSize === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2 px-8 pt-1 pb-4">
              {clean && (
                <p className="text-[12px] text-ink-dim">
                  Nothing structural to flag in this draft.
                </p>
              )}
              {result.findings.map((f) => (
                <FindingRow key={f.id} finding={f} onJump={onSelectScene} />
              ))}
              {result.historyByPlatform.some((p) => !p.ready) && (
                <p className="pt-1 text-[11px] leading-relaxed text-ink-faint">
                  Checks against your own results switch on per account, once {MIN_HISTORY} published posts are
                  linked to episodes on the Analytics page — Instagram and YouTube are measured separately,
                  because a Reel's engagement rate and a YouTube video's are not the same number. Below that, a
                  benchmark drawn from your history would be noise presented as fact.
                  {socialPosts.length > 0 && (
                    <>
                      {' '}
                      Analytics can suggest most of those links for you — it matches published posts to the
                      episodes they came from.
                    </>
                  )}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
