import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { buildHistory } from '../../lib/draftCheck'
import {
  CONFIDENCE_LABEL,
  MIN_SAMPLE,
  overallMedianEngagement,
  scorePatterns,
  type PatternScore,
} from '../../lib/patternScore'
import { formatCount } from '../../lib/social'
import { PURPOSE_COLOR } from '../../lib/types'
import { Icon, Plus, TrendingUp } from '../Icon'

const CONFIDENCE_TONE = {
  none: 'var(--dos-ink-faint)',
  low: '#d3a75c',
  fair: '#6bb15a',
} as const

function BeatChips({ beats }: { beats: PatternScore['beats'] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {beats.map((b, i) => (
        <span
          key={i}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: `${PURPOSE_COLOR[b] ?? '#d3a75c'}22`, color: PURPOSE_COLOR[b] ?? '#d3a75c' }}
        >
          {b}
        </span>
      ))}
    </div>
  )
}

function ScoreRow({
  score,
  rank,
  overall,
  onOpenEpisode,
  onSaveAsPattern,
}: {
  score: PatternScore
  rank: number | null
  overall: number | null
  onOpenEpisode: (projectId: string, episodeId: string) => void
  onSaveAsPattern: (score: PatternScore) => void
}) {
  const hasData = score.confidence !== 'none'
  const vsOverall =
    hasData && overall !== null && score.medianEngagement !== null ? score.medianEngagement - overall : null

  return (
    <div className={`rounded-xl border px-4 py-3.5 ${hasData ? 'border-border bg-surface' : 'border-border-soft bg-surface-2/40'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {rank !== null && (
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10.5px] font-semibold ${
                  rank <= 3 ? 'bg-gold text-[#141316]' : 'bg-surface-2 text-ink-faint'
                }`}
              >
                {rank}
              </span>
            )}
            <span className="truncate text-[13.5px] font-medium text-ink">{score.name}</span>
            {score.discovered && (
              <span
                className="shrink-0 rounded bg-surface-2 px-1.5 py-px text-[9.5px] font-medium tracking-wide text-ink-faint uppercase"
                title="A structure you've used more than once that isn't saved as a pattern yet"
              >
                not saved
              </span>
            )}
          </div>
          <div className="mt-1.5">
            <BeatChips beats={score.beats} />
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-5 text-right">
          <div className="min-w-[64px]">
            <div className="text-[14px] font-medium text-ink tabular-nums">
              {score.medianEngagement === null || !hasData ? '—' : `${score.medianEngagement.toFixed(1)}%`}
            </div>
            <div className="text-[10px] tracking-wide text-ink-faint uppercase">Engagement</div>
            {vsOverall !== null && Math.abs(vsOverall) >= 0.1 && (
              <div
                className="text-[10px] tabular-nums"
                style={{ color: vsOverall > 0 ? '#6bb15a' : '#c96a4a' }}
              >
                {vsOverall > 0 ? '+' : ''}
                {vsOverall.toFixed(1)} vs. your median
              </div>
            )}
          </div>
          <div className="min-w-[56px]">
            <div className="text-[14px] font-medium text-ink tabular-nums">
              {hasData ? formatCount(score.medianViews) : '—'}
            </div>
            <div className="text-[10px] tracking-wide text-ink-faint uppercase">Views</div>
          </div>
          <div className="min-w-[56px]">
            <div className="text-[14px] font-medium text-ink tabular-nums">
              {hasData && score.medianWatched !== null ? `${Math.round(score.medianWatched * 100)}%` : '—'}
            </div>
            <div className="text-[10px] tracking-wide text-ink-faint uppercase">Watched</div>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border-soft pt-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span style={{ color: CONFIDENCE_TONE[score.confidence] }}>{CONFIDENCE_LABEL[score.confidence]}</span>
          <span className="text-ink-faint">·</span>
          <span className="text-ink-faint">
            {score.sampleSize} linked post{score.sampleSize === 1 ? '' : 's'}
          </span>
          {score.matches.slice(0, 3).map((m) => (
            <button
              key={m.episode.id}
              onClick={() => onOpenEpisode(m.episode.projectId, m.episode.id)}
              className="max-w-[180px] truncate text-ink-faint underline decoration-dotted transition hover:text-gold"
            >
              {m.episode.title}
            </button>
          ))}
          {score.matches.length > 3 && (
            <span className="text-ink-faint">+{score.matches.length - 3} more</span>
          )}
        </div>

        {score.discovered && (
          <button
            onClick={() => onSaveAsPattern(score)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-ink-dim transition hover:border-gold hover:text-gold"
          >
            <Plus size={11} />
            Save as pattern
          </button>
        )}
      </div>
    </div>
  )
}

export function PatternScoreboard() {
  const patterns = useAppStore((s) => s.patterns)
  const episodes = useAppStore((s) => s.episodes)
  const socialPosts = useAppStore((s) => s.socialPosts)
  const createPattern = useAppStore((s) => s.createPattern)
  const navigate = useNavigate()

  const history = useMemo(() => buildHistory(episodes, socialPosts), [episodes, socialPosts])
  const scores = useMemo(() => scorePatterns(patterns, history), [patterns, history])
  const overall = useMemo(() => overallMedianEngagement(history), [history])

  const scored = scores.filter((s) => s.confidence !== 'none')
  const unscored = scores.filter((s) => s.confidence === 'none')

  function handleSaveAsPattern(score: PatternScore) {
    createPattern({
      name: score.name,
      description: `Discovered from ${score.sampleSize} of your published episodes.`,
      category: 'Educational',
      estDurationSeconds: Math.round(
        score.matches.reduce((n, m) => n + m.episode.length, 0) / Math.max(1, score.matches.length),
      ),
      beats: score.beats.map((purpose) => ({ purpose, note: '', weight: 1 })),
    })
  }

  return (
    <div>
      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
          <TrendingUp size={26} className="mb-3 text-ink-faint" strokeWidth={1.5} />
          <p className="text-[13.5px] text-ink-dim">No published results linked yet.</p>
          <p className="mx-auto mt-1.5 max-w-[440px] text-[12px] leading-relaxed text-ink-faint">
            On the Analytics page, link each published post to the episode you planned it from. Once a
            structure has {MIN_SAMPLE} linked posts behind it, it starts showing a score here.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-dim">
            <Icon name="wand-2" size={13} className="shrink-0 text-ink-faint" />
            <span>
              Ranked by median engagement across {history.length} linked post
              {history.length === 1 ? '' : 's'}
              {overall !== null && <> · your overall median is {overall.toFixed(1)}%</>}. These are small
              samples — treat them as a lead to test, not a verdict.
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {scored.map((s, i) => (
              <motion.div
                key={s.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: i * 0.03 }}
              >
                <ScoreRow
                  score={s}
                  rank={i + 1}
                  overall={overall}
                  onOpenEpisode={(p, e) => navigate(`/projects/${p}/episodes/${e}`)}
                  onSaveAsPattern={handleSaveAsPattern}
                />
              </motion.div>
            ))}
          </div>

          {unscored.length > 0 && (
            <div className="mt-7">
              <div className="mb-2 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
                Waiting on data
              </div>
              <div className="flex flex-col gap-2">
                {unscored.map((s) => (
                  <ScoreRow
                    key={s.key}
                    score={s}
                    rank={null}
                    overall={overall}
                    onOpenEpisode={(p, e) => navigate(`/projects/${p}/episodes/${e}`)}
                    onSaveAsPattern={handleSaveAsPattern}
                  />
                ))}
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
                A structure needs {MIN_SAMPLE} linked posts before any figure is worth showing. Below that a
                median is just one post, and ranking on it would be worse than not ranking at all.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
