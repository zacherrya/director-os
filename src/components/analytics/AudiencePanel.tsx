import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import { hasGoogleAuth } from '../../lib/credentials'
import {
  defaultWindow,
  fetchNeighbourhood,
  fetchTrafficMix,
  type TrafficSlice,
  type Referrer,
} from '../../lib/youtubeAnalytics'
import { fetchVideosByIds, type PublicVideo } from '../../lib/youtube'
import {
  buildNeighbourhood,
  compareLevers,
  profileLevers,
  scoreAlignment,
  MIN_VIDEOS_FOR_PATTERN,
  type LeverGap,
  type Neighbourhood,
} from '../../lib/neighbourhood'
import { formatCount } from '../../lib/social'
import { Check, Icon, Loader2, X } from '../Icon'

const UP = '#6bb15a'
const DOWN = '#c96a4a'

function TrafficMix({ slices }: { slices: TrafficSlice[] }) {
  if (slices.length === 0) return null
  const max = Math.max(...slices.map((s) => s.views))

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-0.5 text-[13px] font-medium text-ink">Where your views come from</div>
      <p className="mb-4 text-[11.5px] leading-relaxed text-ink-faint">
        Across the last year. Suggested-video traffic is the part this page can act on — the rest is
        context.
      </p>
      <div className="space-y-2">
        {slices.slice(0, 8).map((s) => (
          <div key={s.type} className="flex items-center gap-3">
            <span className="w-[150px] shrink-0 truncate text-right text-[11.5px] text-ink-dim" title={s.label}>
              {s.label}
            </span>
            <div className="h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-surface-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, (s.views / max) * 100)}%` }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-md"
                style={{ backgroundColor: s.type === 'RELATED_VIDEO' ? 'var(--dos-gold)' : 'var(--dos-border)' }}
              />
            </div>
            <span className="w-[44px] shrink-0 text-right text-[11.5px] font-medium text-ink tabular-nums">
              {Math.round(s.share * 100)}%
            </span>
            <span className="w-[54px] shrink-0 text-right text-[10.5px] text-ink-faint tabular-nums">
              {formatCount(s.views)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function VerdictButtons({
  channelId,
  verdict,
}: {
  channelId: string
  verdict: 'on' | 'off' | undefined
}) {
  const setChannelTag = useAppStore((s) => s.setChannelTag)

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={() => setChannelTag(channelId, verdict === 'on' ? undefined : 'on')}
        title="This is the audience I want"
        aria-label="Mark as the audience I want"
        className="rounded-md border px-1.5 py-1 transition"
        style={
          verdict === 'on'
            ? { borderColor: UP, backgroundColor: `${UP}22`, color: UP }
            : { borderColor: 'var(--dos-border)', color: 'var(--dos-ink-faint)' }
        }
      >
        <Check size={12} />
      </button>
      <button
        onClick={() => setChannelTag(channelId, verdict === 'off' ? undefined : 'off')}
        title="Not the audience I want"
        aria-label="Mark as not the audience I want"
        className="rounded-md border px-1.5 py-1 transition"
        style={
          verdict === 'off'
            ? { borderColor: DOWN, backgroundColor: `${DOWN}22`, color: DOWN }
            : { borderColor: 'var(--dos-border)', color: 'var(--dos-ink-faint)' }
        }
      >
        <X size={12} />
      </button>
    </div>
  )
}

function NeighbourhoodList({ neighbourhood }: { neighbourhood: Neighbourhood }) {
  if (neighbourhood.channels.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-1 text-[13px] font-medium text-ink">No suggesting videos yet</div>
        <p className="text-[11.5px] leading-relaxed text-ink-dim">
          YouTube hasn't recorded meaningful suggested-video traffic to this channel in the last year.
          That's normal for Shorts, which arrive through the vertical feed rather than a watch page —
          there is no suggesting video to name.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-0.5 text-[13px] font-medium text-ink">Who YouTube files you next to</div>
      <p className="mb-4 text-[11.5px] leading-relaxed text-ink-faint">
        The channels whose videos actually sent you viewers, biggest first. Mark each one — is this the
        audience you're reaching for? Nothing in the data can answer that, so the rest of this page waits
        on your judgement.
      </p>

      <div className="space-y-2">
        {neighbourhood.channels.map((c) => (
          <div
            key={c.channelId}
            className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface-2 px-3 py-2.5"
          >
            {c.videos[0]?.thumbnail ? (
              <img src={c.videos[0].thumbnail} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
            ) : (
              <div className="flex h-9 w-16 shrink-0 items-center justify-center rounded bg-surface text-ink-faint">
                <Icon name="film" size={14} />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium text-ink">{c.channelTitle}</div>
              <div className="truncate text-[11px] text-ink-faint" title={c.videos[0]?.title}>
                {c.videos.length === 1 ? c.videos[0]?.title : `${c.videos.length} videos · ${c.videos[0]?.title}`}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="text-[12.5px] font-medium text-ink tabular-nums">
                {Math.round(c.share * 100)}%
              </div>
              <div className="text-[10px] text-ink-faint tabular-nums">{formatCount(c.views)} views</div>
            </div>

            <VerdictButtons channelId={c.channelId} verdict={c.verdict} />
          </div>
        ))}
      </div>

      {neighbourhood.unresolved > 0 && (
        <p className="mt-3 text-[11px] text-ink-faint">
          {neighbourhood.unresolved} referring video{neighbourhood.unresolved === 1 ? '' : 's'} could not be
          looked up — deleted, private, or age-restricted since.
        </p>
      )}
    </div>
  )
}

/** Sends a finding to the playbook, where the draft check enforces it. */
function SaveGapAsRule({ text }: { text: string }) {
  const addPlaybookRule = useAppStore((s) => s.addPlaybookRule)
  const playbook = useAppStore((s) => s.playbook)
  if (playbook.some((r) => r.text === text)) {
    return <span className="shrink-0 text-[10px] font-medium text-ink-faint">in playbook</span>
  }
  return (
    <button
      onClick={() => addPlaybookRule({ kind: 'reminder', text, origin: 'insight', enabled: true })}
      className="shrink-0 rounded border border-border px-1.5 py-px text-[10px] font-medium text-ink-faint opacity-0 transition group-hover/gap:opacity-100 hover:border-gold hover:text-gold"
    >
      + Rule
    </button>
  )
}

const LEVER_LABEL: Record<LeverGap['lever'], string> = {
  title: 'Title',
  description: 'Description',
  length: 'Length',
  vocabulary: 'Words',
}

export function AudiencePanel({ myVideoIds }: { myVideoIds: string[] }) {
  const channelTags = useAppStore((s) => s.channelTags)
  const setAudienceVocabulary = useAppStore((s) => s.setAudienceVocabulary)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [traffic, setTraffic] = useState<TrafficSlice[]>([])
  const [referrers, setReferrers] = useState<Referrer[]>([])
  const [theirVideos, setTheirVideos] = useState<PublicVideo[]>([])
  const [myVideos, setMyVideos] = useState<PublicVideo[]>([])
  const [loadedOnce, setLoadedOnce] = useState(false)

  const connected = hasGoogleAuth()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const window = defaultWindow()
      const [mix, refs] = await Promise.all([fetchTrafficMix(undefined, window), fetchNeighbourhood(undefined, window)])
      setTraffic(mix)
      setReferrers(refs)

      const [theirs, mine] = await Promise.all([
        fetchVideosByIds(refs.map((r) => r.videoId)),
        fetchVideosByIds(myVideoIds),
      ])
      setTheirVideos(theirs)
      setMyVideos(mine)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load audience data.')
    } finally {
      setLoading(false)
      setLoadedOnce(true)
    }
  }, [myVideoIds])

  useEffect(() => {
    if (connected && !loadedOnce && !loading) void load()
  }, [connected, loadedOnce, loading, load])

  const neighbourhood = useMemo(
    () => buildNeighbourhood(referrers, theirVideos, channelTags),
    [referrers, theirVideos, channelTags],
  )
  const alignment = useMemo(() => scoreAlignment(neighbourhood), [neighbourhood])

  const gaps = useMemo(() => {
    const onTarget = neighbourhood.channels.filter((c) => c.verdict === 'on').flatMap((c) => c.videos)
    if (onTarget.length === 0 || myVideos.length === 0) return []
    return compareLevers(profileLevers(myVideos), profileLevers(onTarget))
  }, [neighbourhood, myVideos])

  // Kept in the store so caption drafting can steer toward the vocabulary of the
  // neighbourhood this creator actually wants to sit in.
  const onTargetVideos = useMemo(
    () => neighbourhood.channels.filter((c) => c.verdict === 'on').flatMap((c) => c.videos),
    [neighbourhood],
  )
  useEffect(() => {
    if (onTargetVideos.length === 0) return
    setAudienceVocabulary(profileLevers(onTargetVideos).vocabulary.map((v) => v.word))
  }, [onTargetVideos, setAudienceVocabulary])

  const onTargetCount = neighbourhood.channels
    .filter((c) => c.verdict === 'on')
    .reduce((n, c) => n + c.videos.length, 0)

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-ink-faint">
          <Icon name="layers" size={20} />
        </div>
        <p className="text-[15px] font-medium text-ink">Connect deeper analytics</p>
        <p className="mt-1.5 max-w-[440px] text-[12.5px] leading-relaxed text-ink-dim">
          Traffic sources and the videos that suggest yours are private to the channel owner, so they need
          an OAuth connection rather than the API key. Add one under Settings → YouTube.
        </p>
      </div>
    )
  }

  if (loading && !loadedOnce) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-ink-dim">
        <Loader2 size={16} className="animate-spin" />
        Reading your traffic sources…
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

      {alignment.reliable && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-gold/30 bg-gold-soft p-5"
        >
          <div className="mb-1.5 text-[13.5px] font-medium text-ink">Audience alignment</div>
          <div className="font-display text-[30px] leading-tight tracking-tight text-ink tabular-nums">
            {Math.round(alignment.score * 100)}%
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
            {alignment.score >= 0.7
              ? 'Most of your suggested traffic already comes from where you want to be filed. Nothing to fix here — keep making what you are making.'
              : 'That share of your suggested traffic comes from the channels you marked on-target. The rest is reaching people who were looking for something else.'}
          </p>
        </motion.div>
      )}

      <TrafficMix slices={traffic} />

      <NeighbourhoodList neighbourhood={neighbourhood} />

      {onTargetCount > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="mb-0.5 text-[13px] font-medium text-ink">What the on-target videos do differently</div>
          <p className="mb-4 text-[11.5px] leading-relaxed text-ink-faint">
            Your videos against the ones you marked on-target, on the levers you control.
          </p>

          {gaps.length === 0 ? (
            <p className="text-[12.5px] leading-relaxed text-ink-dim">
              {onTargetCount < MIN_VIDEOS_FOR_PATTERN || myVideos.length < MIN_VIDEOS_FOR_PATTERN
                ? `Not enough to compare yet — this needs at least ${MIN_VIDEOS_FOR_PATTERN} videos on each side, and there are ${onTargetCount} on-target and ${myVideos.length} of yours.`
                : 'No meaningful gaps. Your titles, description openings and lengths already sit in the same territory as the on-target videos.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {gaps.map((g, i) => (
                <div key={i} className="group/gap rounded-xl border border-border-soft bg-surface-2 px-3.5 py-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
                      {LEVER_LABEL[g.lever]}
                    </span>
                    <span className="text-[11.5px] text-ink-dim">
                      <span style={{ color: UP }}>{g.theirs}</span>
                      <span className="text-ink-faint"> vs </span>
                      <span style={{ color: DOWN }}>{g.yours}</span>
                    </span>
                    {g.suggestion && <div className="ml-auto"><SaveGapAsRule text={g.suggestion} /></div>}
                  </div>
                  {g.suggestion && (
                    <p className="text-[12px] leading-relaxed text-ink-dim">{g.suggestion}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!alignment.reliable && neighbourhood.channels.length > 0 && (
        <p className="px-1 text-[11.5px] text-ink-faint">
          Mark more channels above to get an alignment score — {Math.round(alignment.coverage * 100)}% of your
          suggested traffic has been judged so far.
        </p>
      )}
    </div>
  )
}
