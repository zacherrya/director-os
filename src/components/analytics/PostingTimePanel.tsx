import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  analyzePostingTime,
  describeSlot,
  HOUR_BANDS,
  MIN_PER_BUCKET,
  MIN_POSTS,
  WEEKDAY_LABELS,
  type TimingBucket,
  type TimingReport,
} from '../../lib/postingTime'
import { formatCount, type PostPerformance, type SocialPlatform } from '../../lib/social'
import { Clock, Icon } from '../Icon'

const UP = '#6bb15a'
const DOWN = '#c96a4a'

function indexColor(index: number): string | undefined {
  if (index >= 1.15) return UP
  if (index <= 0.85) return DOWN
  return undefined
}

/** One dimension — days of the week, or times of day — as ranked bars.
 *
 * `muted` drops the win/loss colouring. Below the history threshold the bars are
 * still worth showing — they're the real numbers so far — but colouring them
 * green and red would contradict the headline telling you not to act on them. */
function BucketBars({
  title,
  subtitle,
  buckets,
  muted,
}: {
  title: string
  subtitle: string
  buckets: TimingBucket[]
  muted: boolean
}) {
  const populated = buckets.filter((b) => b.sampleSize > 0)
  const max = Math.max(1.2, ...populated.map((b) => b.medianIndex ?? 0))

  if (populated.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-0.5 text-[13px] font-medium text-ink">{title}</div>
      <p className="mb-4 text-[11.5px] leading-relaxed text-ink-faint">{subtitle}</p>

      <div className="space-y-2">
        {populated.map((b) => {
          const index = b.medianIndex
          const color = index === null || muted ? undefined : indexColor(index)
          const width = index === null ? 0 : Math.max(2, (index / max) * 100)

          return (
            <div key={b.key} className="flex items-center gap-3">
              <span className="w-[68px] shrink-0 text-right text-[11.5px] text-ink-dim">{b.label}</span>

              <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-surface-2">
                {/* Where "exactly normal" sits, so a bar can be read at a glance. */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-border"
                  style={{ left: `${(1 / max) * 100}%` }}
                  title="Your normal"
                />
                {index !== null && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-md"
                    style={{ backgroundColor: color ?? 'var(--dos-border)' }}
                  />
                )}
              </div>

              <span
                className="w-[52px] shrink-0 text-right text-[11.5px] font-medium tabular-nums"
                style={{ color: color ?? 'var(--dos-ink-faint)' }}
              >
                {index === null ? '—' : `${index.toFixed(2)}×`}
              </span>
              <span
                className="w-[74px] shrink-0 text-right text-[10.5px] text-ink-faint tabular-nums"
                title={
                  b.reliable
                    ? `${b.sampleSize} posts · median ${formatCount(b.medianViews)} views`
                    : `Only ${b.sampleSize} post${b.sampleSize === 1 ? '' : 's'} — needs ${MIN_PER_BUCKET} to be ranked`
                }
              >
                {b.sampleSize} post{b.sampleSize === 1 ? '' : 's'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The full day × time grid. Deliberately secondary — most creators post in a
 * handful of slots, so most cells are empty and the marginals above are what
 * the recommendation is actually built from. */
function SlotGrid({ report, muted }: { report: TimingReport; muted: boolean }) {
  const bandsInUse = HOUR_BANDS.map((_, b) => b).filter((b) =>
    report.grid.some((c) => c.band === b && c.sampleSize > 0),
  )
  if (bandsInUse.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-0.5 text-[13px] font-medium text-ink">Every slot you've used</div>
      <p className="mb-4 text-[11.5px] leading-relaxed text-ink-faint">
        Shaded where a slot has at least {MIN_PER_BUCKET} posts behind it. Faint cells are real posts, just too
        few to read anything into.
      </p>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `56px repeat(${bandsInUse.length}, minmax(56px, 1fr))` }}
          >
            <div />
            {bandsInUse.map((b) => (
              <div key={b} className="pb-1 text-center text-[10px] text-ink-faint">
                {HOUR_BANDS[b].label}
              </div>
            ))}

            {WEEKDAY_LABELS.map((day, w) => (
              <Row key={day} day={day} weekday={w} bands={bandsInUse} report={report} muted={muted} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({
  day,
  weekday,
  bands,
  report,
  muted,
}: {
  day: string
  weekday: number
  bands: number[]
  report: TimingReport
  muted: boolean
}) {
  return (
    <>
      <div className="flex items-center text-[11px] text-ink-dim">{day}</div>
      {bands.map((b) => {
        const cell = report.grid.find((c) => c.weekday === weekday && c.band === b)
        const n = cell?.sampleSize ?? 0
        const index = cell?.medianIndex ?? null
        const color = index === null || muted ? undefined : indexColor(index)
        // Opacity carries the strength; the ring marks "enough posts to trust".
        const strength = index === null ? 0 : Math.min(1, Math.abs(index - 1) / 0.6)

        return (
          <div
            key={b}
            title={
              n === 0
                ? `${day}, ${HOUR_BANDS[b].label} — never posted`
                : index === null
                  ? `${day}, ${HOUR_BANDS[b].label} — ${n} post${n === 1 ? '' : 's'}, too few to score`
                  : `${day}, ${HOUR_BANDS[b].label} — ${n} posts, ${index.toFixed(2)}× your normal`
            }
            className={`flex h-8 items-center justify-center rounded-md text-[10.5px] tabular-nums ${
              n === 0 ? 'bg-surface-2/40 text-transparent' : 'text-ink-dim'
            }`}
            style={
              color
                ? {
                    backgroundColor: `${color}${Math.round((0.12 + strength * 0.3) * 255)
                      .toString(16)
                      .padStart(2, '0')}`,
                    color,
                  }
                : n > 0
                  ? { backgroundColor: 'var(--dos-surface-2)' }
                  : undefined
            }
          >
            {n === 0 ? '·' : index === null ? <span className="opacity-40">{n}</span> : index.toFixed(1)}
          </div>
        )
      })}
    </>
  )
}

function Headline({ report, platform }: { report: TimingReport; platform: SocialPlatform }) {
  const noun = platform === 'instagram' ? 'posts' : 'uploads'

  if (report.verdict === 'insufficient') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-1.5 flex items-center gap-2">
          <Clock size={15} className="text-ink-faint" />
          <span className="text-[13.5px] font-medium text-ink">Not enough history yet</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-dim">
          {report.scoredSize} of your {noun} can be scored so far. Below {MIN_POSTS}, a “best time” is one
          good post wearing a formula — it would send you rescheduling on noise. Keep publishing and this
          fills in on its own.
        </p>
      </div>
    )
  }

  if (report.verdict === 'one-slot') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-1.5 flex items-center gap-2">
          <Clock size={15} className="text-ink-faint" />
          <span className="text-[13.5px] font-medium text-ink">Nothing to compare against</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-dim">
          Almost everything went out in the same slot, so there's no alternative to measure it against. Try
          moving a few {noun} to a different day or time band — a handful is enough to start reading this.
        </p>
      </div>
    )
  }

  if (report.verdict === 'no-signal') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-1.5 flex items-center gap-2">
          <Clock size={15} className="text-ink-faint" />
          <span className="text-[13.5px] font-medium text-ink">Timing isn't what's holding you back</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-dim">
          Across {report.scoredSize} {noun}, no slot beat your normal by enough to be worth reorganising your
          week around. That's a useful answer: the gap between your best and worst {noun} is coming from the
          videos, not the clock. The hook workshop and draft check are where the leverage is.
        </p>
      </div>
    )
  }

  const slot = report.best!
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-gold/30 bg-gold-soft p-5"
    >
      <div className="mb-2 flex items-center gap-2">
        <Clock size={15} className="text-gold" />
        <span className="text-[13.5px] font-medium text-ink">Your best slot</span>
      </div>
      <div className="font-display text-[26px] leading-tight tracking-tight text-ink">
        {describeSlot(slot)}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
        {noun[0].toUpperCase() + noun.slice(1)} published then do{' '}
        <span className="font-medium text-ink">{Math.round(slot.lift * 100)}% better</span> than your normal,
        across {report.scoredSize} {noun}.
        {!slot.confident && ' Still an early read — the slot is ahead, but on a thin sample.'}
      </p>
      {report.worst && (report.worst.weekday !== null || report.worst.band !== null) && (
        <p className="mt-1.5 text-[11.5px] text-ink-faint">
          Weakest:{' '}
          {[
            report.worst.weekday !== null ? WEEKDAY_LABELS[report.worst.weekday] : null,
            report.worst.band !== null ? HOUR_BANDS[report.worst.band].label : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </motion.div>
  )
}

export function PostingTimePanel({
  posts,
  platform,
}: {
  posts: PostPerformance[]
  platform: SocialPlatform
}) {
  const report = useMemo(() => analyzePostingTime(posts), [posts])
  const muted = report.verdict === 'insufficient'

  return (
    <div className="space-y-4">
      <Headline report={report} platform={platform} />

      <BucketBars
        title="By day of the week"
        subtitle="How posts on each day did against the posts published around them — so a growing account doesn't make your older days look like bad timing."
        buckets={report.byWeekday}
        muted={muted}
      />

      <BucketBars
        title="By time of day"
        subtitle={`Your local time (${report.timezone}). Same comparison, split by the three-hour band you published in.`}
        buckets={report.byBand}
        muted={muted}
      />

      <SlotGrid report={report} muted={muted} />

      <div className="rounded-2xl border border-border bg-surface-2 p-4">
        <div className="mb-1.5 flex items-center gap-2">
          <Icon name="wand-2" size={12} className="text-ink-faint" />
          <span className="text-[11.5px] font-medium text-ink-dim">How this is worked out</span>
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-faint">
          Each post is scored against the {'≈'}8 posts published either side of it, not against your
          all-time average. Those neighbours share the same account size and roughly the same age, so the
          score reflects the slot rather than how much you'd grown or how long the post has been collecting
          views. 1.00× is exactly your normal.
        </p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
          {platform === 'youtube' ? (
            <>
              YouTube's “when your viewers are on YouTube” chart is Studio-only — it isn't in the Data API,
              and no OAuth scope in the Analytics API unlocks it either. It's worth a look in Studio →
              Audience, but treat it as when people are <em>scrolling</em>. What's above is when they
              actually watched yours.
            </>
          ) : (
            <>
              Instagram's followers-online metric was retired by Meta and isn't available on this connection
              at all. What's above is the stronger signal anyway: it counts people who watched your reels, not
              people who happened to have the app open.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
