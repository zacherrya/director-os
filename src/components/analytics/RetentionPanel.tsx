import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { hasGoogleAuth } from '../../lib/credentials'
import { fetchRetentionCurve, windowSincePublished } from '../../lib/youtubeAnalytics'
import {
  analyzeRetention,
  findRetentionPatterns,
  toSnapshot,
  CONFIDENT_VIEWS,
  MIN_VIDEOS_FOR_PATTERN,
  type RetentionFinding,
  type RetentionReport,
} from '../../lib/retentionAnalysis'
import type { PostPerformance } from '../../lib/social'
import { formatCount } from '../../lib/social'
import type { Episode } from '../../lib/types'
import { RetentionGraph, RetentionSparkline } from './RetentionGraph'
import { Icon, Loader2 } from '../Icon'

const BAD = '#c96a4a'
const GOOD = '#6bb15a'
/** Curves are one request per video, so the audit is capped. */
const AUDIT_SIZE = 10

const SEVERITY_COLOR: Record<RetentionFinding['severity'], string> = {
  high: BAD,
  medium: 'var(--dos-gold)',
  good: GOOD,
}

async function mapLimited<T, R>(items: T[], width: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await worker(items[i])
      }
    }),
  )
  return out
}

/** Findings can be pushed straight into the playbook, where the draft check runs them. */
function SaveFixAsRule({ text }: { text: string }) {
  const addPlaybookRule = useAppStore((s) => s.addPlaybookRule)
  const playbook = useAppStore((s) => s.playbook)
  if (playbook.some((r) => r.text === text)) {
    return <span className="shrink-0 text-[10px] font-medium text-ink-faint">in playbook</span>
  }
  return (
    <button
      onClick={() => addPlaybookRule({ kind: 'reminder', text, origin: 'insight', enabled: true })}
      className="shrink-0 rounded border border-border px-1.5 py-px text-[10px] font-medium text-ink-faint opacity-0 transition group-hover/f:opacity-100 hover:border-gold hover:text-gold"
    >
      + Rule
    </button>
  )
}

function FindingRow({
  finding,
  episode,
  onOpenScene,
}: {
  finding: RetentionFinding
  episode: Episode | undefined
  onOpenScene: (episode: Episode, sceneId: string) => void
}) {
  const color = SEVERITY_COLOR[finding.severity]
  return (
    <div className="group/f rounded-xl border border-border-soft bg-surface-2 px-3.5 py-3">
      <div className="mb-1 flex items-start gap-2">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 text-[12.5px] font-medium" style={{ color }}>
          {finding.title}
        </span>
        {finding.fix && <SaveFixAsRule text={finding.fix} />}
      </div>
      <p className="pl-3.5 text-[12px] leading-relaxed text-ink-dim">{finding.detail}</p>
      {finding.fix && (
        <p className="mt-1.5 border-l-2 pl-2 text-[12px] leading-relaxed text-ink" style={{ borderColor: color, marginLeft: '0.875rem' }}>
          {finding.fix}
        </p>
      )}
      {finding.scene && episode && (
        <button
          onClick={() => onOpenScene(episode, finding.scene!.id)}
          className="mt-2 ml-3.5 text-[11px] text-ink-faint underline decoration-dotted transition hover:text-gold"
        >
          Open scene {finding.scene.index} · {finding.scene.purpose} →
        </button>
      )}
    </div>
  )
}

/**
 * What the audit actually covered.
 *
 * YouTube withholds retention for videos without much watch time, so on a
 * smaller channel most of the last ten come back empty. Saying so plainly beats
 * showing one lonely graph and letting it look broken.
 */
function AuditCoverage({
  covered,
  skipped,
}: {
  covered: number
  skipped: { title: string; reason: string }[]
}) {
  const [open, setOpen] = useState(false)
  if (skipped.length === 0) return null

  const total = covered + skipped.length
  const reasons = [...new Set(skipped.map((s) => s.reason))]

  return (
    <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12.5px] text-ink-dim">
          <span className="font-medium text-ink">
            {covered} of {total}
          </span>{' '}
          recent {total === 1 ? 'video has' : 'videos have'} a retention curve.
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[11.5px] text-ink-faint underline decoration-dotted transition hover:text-ink-dim"
        >
          {open ? 'Hide' : `Why not the other ${skipped.length}?`}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {reasons.length === 1 && (
            <p className="text-[11.5px] leading-relaxed text-ink-faint">{reasons[0]}</p>
          )}
          {skipped.map((sk, i) => (
            <div key={i} className="border-l-2 border-border pl-2.5">
              <div className="truncate text-[11.5px] text-ink-dim" title={sk.title}>
                {sk.title}
              </div>
              {reasons.length > 1 && (
                <div className="text-[11px] leading-relaxed text-ink-faint">{sk.reason}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 1st, 2nd, 3rd, 4th — including the 11/12/13 exceptions. */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5" title={hint}>
      <div className="text-[10px] tracking-wide text-ink-faint uppercase">{label}</div>
      <div className="mt-0.5 font-display text-[19px] text-ink tabular-nums">{value}</div>
    </div>
  )
}

export function RetentionPanel({ posts }: { posts: PostPerformance[] }) {
  const episodes = useAppStore((s) => s.episodes)
  const setRetention = useAppStore((s) => s.setRetention)
  const navigate = useNavigate()
  const [reports, setReports] = useState<RetentionReport[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Videos YouTube returned nothing for, and why — never swallowed silently. */
  const [skipped, setSkipped] = useState<{ title: string; reason: string }[]>([])

  const connected = hasGoogleAuth()
  const audit = useMemo(() => posts.slice(0, AUDIT_SIZE), [posts])

  const episodeFor = useCallback(
    (videoId: string) => episodes.find((e) => e.youtubeVideoId === videoId && !e.deletedAt),
    [episodes],
  )

  const load = useCallback(async () => {
    if (audit.length === 0) return
    setLoading(true)
    setError(null)
    try {
      // One video without retention data shouldn't cost the audit — but it also
      // shouldn't vanish without explanation, which is what a bare catch does.
      const results = await mapLimited(audit, 3, async (post) => {
        try {
          // Each video is queried across its own lifetime, so an older upload's
          // watch time isn't cut off by a shared rolling window.
          const curve = await fetchRetentionCurve(post.id, windowSincePublished(post.publishedAt))
          if (curve.points.length === 0) {
            return {
              skip: {
                title: post.title,
                reason: 'YouTube returned no retention rows for this video, even over its full lifetime.',
              },
            }
          }
          return {
            report: analyzeRetention(
              curve,
              { videoId: post.id, title: post.title, durationSeconds: post.duration, views: post.views },
              episodeFor(post.id),
            ),
          }
        } catch (err) {
          return {
            skip: { title: post.title, reason: err instanceof Error ? err.message : 'Request failed.' },
          }
        }
      })

      const usable = results.flatMap((r) => ('report' in r && r.report ? [r.report] : []))
      const missed = results.flatMap((r) => ('skip' in r && r.skip ? [r.skip] : []))
      setReports(usable)
      setSkipped(missed)
      // Cached so the draft check can use these shapes without a network call —
      // the same bargain `setSocialPosts` makes for published performance.
      setRetention(usable.map(toSnapshot))
      if (usable.length > 0) setSelected((s) => s ?? usable[0].videoId)
      if (usable.length === 0 && missed.length === 0) {
        setError('No retention data came back for these videos.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load retention data.')
    } finally {
      setLoading(false)
      setLoadedOnce(true)
    }
  }, [audit, episodeFor, setRetention])

  useEffect(() => {
    if (connected && !loadedOnce && !loading) void load()
  }, [connected, loadedOnce, loading, load])

  const current = reports.find((r) => r.videoId === selected) ?? reports[0]
  const patterns = useMemo(() => findRetentionPatterns(reports), [reports])

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-ink-faint">
          <Icon name="gauge" size={20} />
        </div>
        <p className="text-[15px] font-medium text-ink">Connect deeper analytics</p>
        <p className="mt-1.5 max-w-[440px] text-[12.5px] leading-relaxed text-ink-dim">
          Retention curves are private to the channel owner, so they need the OAuth connection rather than
          the API key. Add one under Settings → YouTube.
        </p>
      </div>
    )
  }

  if (loading && !loadedOnce) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-ink-dim">
        <Loader2 size={16} className="animate-spin" />
        Reading retention curves for your last {audit.length} videos…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-[12.5px] leading-relaxed text-red-400">
          {error}
        </div>
      )}

      <AuditCoverage covered={reports.length} skipped={skipped} />

      {patterns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-gold/30 bg-gold-soft p-5"
        >
          <div className="mb-2.5 text-[13.5px] font-medium text-ink">The same thing keeps happening</div>
          <div className="space-y-2.5">
            {patterns.map((p, i) => (
              <div key={i} className="group/f">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-dim">{p.detail}</p>
                  <SaveFixAsRule text={p.fix} />
                </div>
                <p className="mt-1 border-l-2 border-gold/50 pl-2 text-[12.5px] leading-relaxed text-ink">{p.fix}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {reports.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {reports.map((r) => (
            <button
              key={r.videoId}
              onClick={() => setSelected(r.videoId)}
              className={`w-[184px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition ${
                r.videoId === current?.videoId
                  ? 'border-gold bg-gold-soft'
                  : 'border-border bg-surface hover:border-ink-faint'
              }`}
            >
              <div className="truncate text-[12px] font-medium text-ink" title={r.title}>
                {r.title}
              </div>
              <RetentionSparkline report={r} />
              <div className="mt-1 flex items-center gap-2 text-[10.5px] text-ink-faint tabular-nums">
                <span>{r.averagePercentViewed === null ? '—' : `${Math.round(r.averagePercentViewed * 100)}% avg`}</span>
                {r.findings.some((f) => f.severity === 'high') && (
                  <span style={{ color: BAD }}>· needs work</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {current && (
        <>
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium text-ink">{current.title}</div>
                <div className="text-[11px] text-ink-faint">
                  {formatCount(current.views)} views
                  {!current.confident && ` · under ${formatCount(CONFIDENT_VIEWS)}, so treat this curve as provisional`}
                </div>
              </div>
            </div>

            <RetentionGraph report={current} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Past the hook"
              value={current.hookRetention === null ? '—' : `${Math.round(current.hookRetention * 100)}%`}
              hint="Share still watching once the early browsers have filtered out. Below 60% points at the intro."
            />
            <Stat
              label="Average viewed"
              value={current.averagePercentViewed === null ? '—' : `${Math.round(current.averagePercentViewed * 100)}%`}
              hint="The area under the curve — the share of the video the average viewer saw."
            />
            <Stat
              label="Reach the end"
              value={current.endingRetention === null ? '—' : `${Math.round(current.endingRetention * 100)}%`}
              hint="Finishing is one of the strongest quality signals YouTube has."
            />
            <Stat
              label="Vs. similar length"
              value={current.relativePerformance === null ? '—' : ordinal(Math.round(current.relativePerformance * 100))}
              hint="Percentile against all YouTube videos of similar length. 50th is dead average. This is the benchmark that doesn't punish you for making longer videos."
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-0.5 text-[13px] font-medium text-ink">What this curve is telling you</div>
            <p className="mb-4 text-[11.5px] leading-relaxed text-ink-faint">
              Problems first, then the parts that worked.
              {current.sceneMarks.length === 0 &&
                ' Link this video to an episode on the Top posts tab and each finding will name the scene it lands in.'}
            </p>
            <div className="space-y-2.5">
              {current.findings.map((f, i) => (
                <FindingRow
                  key={i}
                  finding={f}
                  episode={episodeFor(current.videoId)}
                  onOpenScene={(ep, sceneId) =>
                    navigate(`/projects/${ep.projectId}/episodes/${ep.id}?scene=${sceneId}`)
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}

      {reports.length > 0 && reports.length < MIN_VIDEOS_FOR_PATTERN && (
        <p className="px-1 text-[11.5px] text-ink-faint">
          Cross-video patterns need at least {MIN_VIDEOS_FOR_PATTERN} videos with usable curves — there
          {reports.length === 1 ? ' is' : ' are'} {reports.length} so far. One video shows you a moment; several
          show you a habit.
        </p>
      )}
    </div>
  )
}
