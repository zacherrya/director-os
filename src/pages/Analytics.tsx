import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { computeBaselines, diagnoseExit, viewsMultiple, type Baselines } from '../lib/retention'
import { hasInstagramToken, hasYouTube } from '../lib/credentials'
import { fetchInstagramAccount, fetchInstagramPosts } from '../lib/instagram'
import { fetchYouTubeAccount, fetchYouTubePosts } from '../lib/youtube'
import { analyzePerformance, type PerformanceInsights } from '../lib/performanceAnalysis'
import {
  engagementRate,
  formatCount,
  formatRelativeDate,
  formatSeconds,
  rankPosts,
  RANK_METRICS,
  type PostPerformance,
  type RankMetric,
  type SocialPlatform,
} from '../lib/social'
import type { Episode } from '../lib/types'
import { AudiencePanel } from '../components/analytics/AudiencePanel'
import { LinkSuggestions } from '../components/analytics/LinkSuggestions'
import { PostingTimePanel } from '../components/analytics/PostingTimePanel'
import { RetentionPanel } from '../components/analytics/RetentionPanel'
import { SettingsModal } from '../components/SettingsModal'
import { toast } from '../lib/toast'
import { ChevronDown, Clock, ExternalLink, Icon, Loader2, Sparkles, TrendingUp } from '../components/Icon'

const PLATFORMS: { id: SocialPlatform; label: string; icon: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: 'camera' },
  { id: 'youtube', label: 'YouTube', icon: 'film' },
]

/** The ranked list is about your recent work; the timing analysis needs depth.
 * One fetch serves both — the list slices the newest few off the front. */
const HISTORY_LIMIT = 50
const RANKED_COUNT = 10

type View = 'posts' | 'timing' | 'audience' | 'retention'

interface PlatformState {
  posts: PostPerformance[]
  account: string | null
  followers: number | null
  loading: boolean
  error: string | null
  loadedOnce: boolean
}

const EMPTY: PlatformState = {
  posts: [],
  account: null,
  followers: null,
  loading: false,
  error: null,
  loadedOnce: false,
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[52px]">
      <div className="text-[13px] font-medium text-ink tabular-nums">{value}</div>
      <div className="text-[10px] tracking-wide text-ink-faint uppercase">{label}</div>
    </div>
  )
}

/** "2.3× median" — the only honest way to read a raw view count on a small account. */
function MultipleBadge({ multiple }: { multiple: number }) {
  const strong = multiple >= 1.2
  const weak = multiple <= 0.8
  const color = strong ? '#6bb15a' : weak ? '#c96a4a' : undefined
  return (
    <span
      className="rounded px-1 py-px text-[10px] font-medium tabular-nums"
      style={
        color
          ? { backgroundColor: `${color}1f`, color }
          : { color: 'var(--dos-ink-faint)' }
      }
      title="Views compared with this account's median for the posts shown"
    >
      {multiple >= 10 ? multiple.toFixed(0) : multiple.toFixed(1)}× median
    </span>
  )
}

function PostRow({
  post,
  rank,
  episodes,
  linkedEpisode,
  baselines,
  onLink,
  onInspectScene,
}: {
  post: PostPerformance
  rank: number
  episodes: { projectName: string; items: Episode[] }[]
  linkedEpisode: Episode | undefined
  baselines: Baselines
  onLink: (episodeId: string | null) => void
  onInspectScene: (episode: Episode, sceneId: string) => void
}) {
  const rate = engagementRate(post)
  const isTop3 = rank <= 3
  const linkedEpisodeId = linkedEpisode?.id
  const multiple = viewsMultiple(post, baselines)
  const exit = diagnoseExit(post.avgWatchTime, linkedEpisode)

  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border bg-surface px-4 py-3">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${
          isTop3 ? 'bg-gold text-[#141316]' : 'bg-surface-2 text-ink-faint'
        }`}
      >
        {rank}
      </span>

      {post.thumbnail ? (
        <img src={post.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-faint">
          <Icon name="film" size={16} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-ink">{post.title}</span>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-ink-faint transition hover:text-gold"
              title="Open on the platform"
              aria-label="Open on the platform"
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
          <span>{post.format}</span>
          <span>·</span>
          <span>{formatRelativeDate(post.publishedAt)}</span>
          {post.avgWatchTime !== null && (
            <>
              <span>·</span>
              <span>{formatSeconds(post.avgWatchTime)} avg watch</span>
            </>
          )}
        </div>
        <div className="relative mt-1.5 inline-flex items-center">
          <select
            value={linkedEpisodeId ?? ''}
            onChange={(e) => onLink(e.target.value === '' ? null : e.target.value)}
            className={`cursor-pointer appearance-none rounded-md border py-0.5 pr-6 pl-2 text-[10.5px] outline-none transition ${
              linkedEpisodeId
                ? 'border-gold/40 bg-gold-soft text-gold'
                : 'border-border bg-surface-2 text-ink-faint hover:text-ink-dim'
            }`}
          >
            <option value="">Not linked to an episode</option>
            {episodes.map((group) => (
              <optgroup key={group.projectName} label={group.projectName}>
                {group.items.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={11} className="pointer-events-none absolute right-1.5 text-current opacity-60" />
        </div>

        {exit && linkedEpisode && (
          <button
            onClick={() => onInspectScene(linkedEpisode, exit.sceneId)}
            title="Average watch time is a single figure, not a curve — this is the average exit point, measured against the plan in Director OS."
            aria-label="Average watch time is a single figure, not a curve — this is the average exit point, measured against the plan in Director OS."
            className={`mt-1.5 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10.5px] transition ${
              exit.watchedToEnd
                ? 'border-[#6bb15a]/30 bg-[#6bb15a]/10 text-[#6bb15a] hover:bg-[#6bb15a]/20'
                : 'border-[#c96a4a]/30 bg-[#c96a4a]/10 text-[#c96a4a] hover:bg-[#c96a4a]/20'
            }`}
          >
            {exit.watchedToEnd ? (
              <>Average viewer watched the whole plan — open scene {exit.sceneIndex} →</>
            ) : (
              <>
                Drops in scene {exit.sceneIndex} · {exit.purpose} ({formatSeconds(exit.secondsIntoScene)} in,{' '}
                {Math.round(exit.fractionWatched * 100)}% watched) →
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-5 text-right">
        <div className="min-w-[64px]">
          <div className="text-[13px] font-medium text-ink tabular-nums">{formatCount(post.views)}</div>
          <div className="text-[10px] tracking-wide text-ink-faint uppercase">Views</div>
          {multiple !== null && (
            <div className="mt-0.5">
              <MultipleBadge multiple={multiple} />
            </div>
          )}
        </div>
        <MetricCell label="Likes" value={formatCount(post.likes)} />
        <MetricCell label="Comments" value={formatCount(post.comments)} />
        <MetricCell label="Eng." value={rate === null ? '—' : `${rate.toFixed(1)}%`} />
      </div>
    </div>
  )
}

function BaselineTiles({ baselines, platform }: { baselines: Baselines; platform: SocialPlatform }) {
  const tiles: { label: string; value: string; hint: string }[] = [
    {
      label: 'Median views',
      value: formatCount(baselines.medianViews),
      hint: 'The middle of these posts — your normal, not your best.',
    },
    {
      label: 'Median engagement',
      value: baselines.medianEngagement === null ? '—' : `${baselines.medianEngagement.toFixed(1)}%`,
      hint: 'Interactions as a share of views, at the midpoint.',
    },
  ]

  if (platform === 'instagram') {
    tiles.push({
      label: 'Reach vs. audience',
      value: baselines.medianReachMultiple === null ? '—' : `${baselines.medianReachMultiple.toFixed(0)}×`,
      hint: 'Median reach divided by your follower count — how far a typical post travels past the people who already follow you. This is the number that grows an account your size.',
    })
  }

  return (
    <div className="mb-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-surface px-4 py-3" title={t.hint}>
            <div className="text-[10px] tracking-wide text-ink-faint uppercase">{t.label}</div>
            <div className="mt-1 font-display text-[22px] text-ink tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>
      {!baselines.reliable && (
        <p className="mt-2 text-[11px] text-ink-faint">
          Only {baselines.sampleSize} post{baselines.sampleSize === 1 ? '' : 's'} to compare — medians and the
          ×-median badges stay hidden until there are at least 3.
        </p>
      )}
    </div>
  )
}

function ConnectPrompt({ platform, onConnect }: { platform: SocialPlatform; onConnect: () => void }) {
  const copy =
    platform === 'instagram'
      ? {
          title: 'Connect Instagram',
          body: 'Add a read-only access token from your own Meta app to pull views, reach, saves and average watch time for your recent posts.',
          note: 'Director OS never requests publishing permission, so it structurally cannot post to your account.',
        }
      : {
          title: 'Connect YouTube',
          body: 'Add a YouTube Data API key and your channel handle to pull views, likes and comments for your recent uploads.',
          note: 'No OAuth required — this reads public statistics only.',
        }

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-ink-faint">
        <Icon name={platform === 'instagram' ? 'camera' : 'film'} size={20} />
      </div>
      <p className="text-[15px] font-medium text-ink">{copy.title}</p>
      <p className="mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed text-ink-dim">{copy.body}</p>
      <p className="mt-1.5 max-w-[420px] text-[11.5px] leading-relaxed text-ink-faint">{copy.note}</p>
      <button
        onClick={onConnect}
        className="mt-5 rounded-lg bg-gold px-4 py-2 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright"
      >
        Add credentials
      </button>
    </div>
  )
}

/** Sends a proven observation to the playbook, where the draft check will enforce
 * it on every future episode. Saved as a reminder — the creator can sharpen it
 * into a measurable rule on the Playbook page. */
function SaveAsRule({ text }: { text: string }) {
  const addPlaybookRule = useAppStore((s) => s.addPlaybookRule)
  const playbook = useAppStore((s) => s.playbook)
  const already = playbook.some((r) => r.text === text)

  if (already) {
    return <span className="shrink-0 text-[10px] font-medium text-ink-faint">in playbook</span>
  }
  return (
    <button
      onClick={() => addPlaybookRule({ kind: 'reminder', text, origin: 'insight', enabled: true })}
      title="Add this to your playbook so the draft check enforces it on future episodes"
      aria-label="Add this to your playbook so the draft check enforces it on future episodes"
      className="shrink-0 rounded border border-border px-1.5 py-px text-[10px] font-medium text-ink-faint opacity-0 transition group-hover/insight:opacity-100 hover:border-gold hover:text-gold"
    >
      + Rule
    </button>
  )
}

function InsightsPanel({ insights }: { insights: PerformanceInsights }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-5 rounded-2xl border border-gold/30 bg-gold-soft p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={15} className="text-gold" />
        <span className="text-[13.5px] font-medium text-ink">What the numbers say</span>
      </div>

      {insights.summary && (
        <p className="mb-4 text-[13px] leading-relaxed text-ink-dim">{insights.summary}</p>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        {insights.working.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">Working</div>
            <ul className="space-y-1.5">
              {insights.working.map((w, i) => (
                <li key={i} className="group/insight flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-dim">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#6bb15a]" />
                  <span className="min-w-0 flex-1">{w}</span>
                  <SaveAsRule text={w} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {insights.notWorking.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">
              Underperforming
            </div>
            <ul className="space-y-1.5">
              {insights.notWorking.map((w, i) => (
                <li key={i} className="group/insight flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-dim">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#c96a4a]" />
                  <span className="min-w-0 flex-1">{w}</span>
                  <SaveAsRule text={w} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {insights.nextVideos.length > 0 && (
        <div>
          <div className="mb-2 text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">Make next</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {insights.nextVideos.map((v, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-3">
                <div className="text-[12.5px] font-medium text-ink">{v.title}</div>
                {v.hook && (
                  <p className="mt-1.5 border-l-2 border-gold/50 pl-2 text-[11.5px] leading-relaxed text-ink-dim italic">
                    “{v.hook}”
                  </p>
                )}
                {v.why && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{v.why}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

export function Analytics() {
  const allEpisodes = useAppStore((s) => s.episodes)
  const allProjects = useAppStore((s) => s.projects)
  const linkEpisodeToPost = useAppStore((s) => s.linkEpisodeToPost)
  const setSocialPosts = useAppStore((s) => s.setSocialPosts)
  const playbook = useAppStore((s) => s.playbook)
  const navigate = useNavigate()

  const [platform, setPlatform] = useState<SocialPlatform>('instagram')
  const [state, setState] = useState<Record<SocialPlatform, PlatformState>>({
    instagram: EMPTY,
    youtube: EMPTY,
  })
  const [metric, setMetric] = useState<RankMetric>('views')
  const [view, setView] = useState<View>('posts')
  const [settingsTab, setSettingsTab] = useState<'Instagram' | 'YouTube' | null>(null)
  const [insights, setInsights] = useState<Record<SocialPlatform, PerformanceInsights | null>>({
    instagram: null,
    youtube: null,
  })
  const [analyzing, setAnalyzing] = useState(false)

  const connected = platform === 'instagram' ? hasInstagramToken() : hasYouTube()
  const current = state[platform]

  const episodeGroups = useMemo(
    () =>
      allProjects
        .filter((p) => !p.deletedAt)
        .map((p) => ({
          projectName: p.name,
          items: allEpisodes.filter((e) => e.projectId === p.id && !e.deletedAt),
        }))
        .filter((g) => g.items.length > 0),
    [allProjects, allEpisodes],
  )

  const episodeForPost = useCallback(
    (postId: string): Episode | undefined =>
      allEpisodes.find((e) =>
        platform === 'instagram' ? e.instagramMediaId === postId : e.youtubeVideoId === postId,
      ),
    [allEpisodes, platform],
  )

  const load = useCallback(async (which: SocialPlatform) => {
    setState((s) => ({ ...s, [which]: { ...s[which], loading: true, error: null } }))
    try {
      const [account, posts] =
        which === 'instagram'
          ? await Promise.all([fetchInstagramAccount(), fetchInstagramPosts(HISTORY_LIMIT)])
          : await Promise.all([fetchYouTubeAccount(), fetchYouTubePosts(HISTORY_LIMIT)])

      // Cached in the store so the timeline's draft check can compare a draft
      // against real published results without refetching.
      setSocialPosts(which, posts)

      setState((s) => ({
        ...s,
        [which]: {
          posts,
          account: 'username' in account ? `@${account.username}` : account.title,
          followers: 'followers' in account ? account.followers : account.subscribers,
          loading: false,
          error: null,
          loadedOnce: true,
        },
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        [which]: {
          ...s[which],
          loading: false,
          loadedOnce: true,
          error: err instanceof Error ? err.message : 'Could not load analytics.',
        },
      }))
    }
  }, [setSocialPosts])

  // Fetches the first time a connected platform is shown, and again after the
  // Settings modal closes (credentials may have just been added).
  useEffect(() => {
    if (connected && !state[platform].loadedOnce && !state[platform].loading) void load(platform)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, connected, settingsTab])

  // The list, the medians and the ×-median badges all stay about the last few
  // posts. The full history exists for the timing analysis, which needs the depth.
  const recentPosts = useMemo(() => current.posts.slice(0, RANKED_COUNT), [current.posts])
  const ranked = useMemo(() => rankPosts(recentPosts, metric), [recentPosts, metric])
  const linkedCount = ranked.filter((p) => episodeForPost(p.id)).length
  const baselines = useMemo(
    () => computeBaselines(recentPosts, current.followers),
    [recentPosts, current.followers],
  )
  const dropOffCount = ranked.filter((p) => {
    const exit = diagnoseExit(p.avgWatchTime, episodeForPost(p.id))
    return exit && !exit.watchedToEnd
  }).length

  async function handleAnalyze() {
    if (analyzing) return
    setAnalyzing(true)
    try {
      const map = new Map<string, Episode>()
      recentPosts.forEach((p) => {
        const ep = episodeForPost(p.id)
        if (ep) map.set(p.id, ep)
      })
      const result = await analyzePerformance(ranked, map, playbook)
      setInsights((s) => ({ ...s, [platform]: result }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-10 py-10">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2.5 font-display text-[28px] tracking-tight text-ink">
              <TrendingUp size={24} className="text-gold" strokeWidth={1.75} />
              Analytics
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-dim">
              {view === 'posts'
                ? `Your last ${RANKED_COUNT} posts, ranked — and what they suggest you make next.`
                : view === 'timing'
                  ? 'When your posts actually landed — measured against your own results, not a generic best-time chart.'
                  : view === 'retention'
                    ? 'Where viewers actually leave, which scene it lands in, and what to change next time.'
                    : 'Where YouTube is filing you, and how that compares with where you want to be.'}
            </p>
          </div>
          {connected && (
            <button
              onClick={() => load(platform)}
              disabled={current.loading}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-ink-dim transition hover:border-ink-faint hover:text-ink disabled:opacity-50"
            >
              {current.loading ? <Loader2 size={13} className="animate-spin" /> : <Icon name="wand-2" size={13} />}
              {current.loading ? 'Loading…' : 'Refresh'}
            </button>
          )}
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-lg border border-border p-0.5">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPlatform(p.id)
                  if (p.id !== 'youtube') setView((v) => (v === 'audience' || v === 'retention' ? 'posts' : v))
                }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
                  platform === p.id ? 'bg-elevated text-ink shadow-sm' : 'text-ink-dim hover:text-ink'
                }`}
              >
                <Icon name={p.icon} size={13} />
                {p.label}
              </button>
            ))}
          </div>

          {connected && current.posts.length > 0 && (
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button
                onClick={() => setView('posts')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
                  view === 'posts' ? 'bg-elevated text-ink shadow-sm' : 'text-ink-dim hover:text-ink'
                }`}
              >
                <TrendingUp size={13} />
                Top posts
              </button>
              <button
                onClick={() => setView('timing')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
                  view === 'timing' ? 'bg-elevated text-ink shadow-sm' : 'text-ink-dim hover:text-ink'
                }`}
              >
                <Clock size={13} />
                Best time to post
              </button>
              {platform === 'youtube' && (
                <button
                  onClick={() => setView('retention')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
                    view === 'retention' ? 'bg-elevated text-ink shadow-sm' : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  <Icon name="gauge" size={13} />
                  Retention
                </button>
              )}
              {platform === 'youtube' && (
                <button
                  onClick={() => setView('audience')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
                    view === 'audience' ? 'bg-elevated text-ink shadow-sm' : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  <Icon name="layers" size={13} />
                  Audience
                </button>
              )}
            </div>
          )}

          {connected && current.posts.length > 0 && view === 'posts' && (
            <div className="ml-auto flex items-center gap-2.5">
              <span className="text-[11.5px] text-ink-faint">Rank by</span>
              <div className="relative">
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as RankMetric)}
                  className="cursor-pointer appearance-none rounded-lg border border-border bg-surface-2 py-1.5 pr-7 pl-2.5 text-[12px] text-ink outline-none focus:border-gold"
                >
                  {RANK_METRICS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-faint" />
              </div>
            </div>
          )}
        </div>

        {!connected ? (
          <ConnectPrompt
            platform={platform}
            onConnect={() => setSettingsTab(platform === 'instagram' ? 'Instagram' : 'YouTube')}
          />
        ) : (
          <>
            {(current.account || current.followers !== null) && (
              <div className="mb-4 flex items-center gap-2 text-[12.5px] text-ink-dim">
                <span className="font-medium text-ink">{current.account}</span>
                {current.followers !== null && (
                  <>
                    <span className="text-ink-faint">·</span>
                    <span>
                      {formatCount(current.followers)}{' '}
                      {platform === 'instagram' ? 'followers' : 'subscribers'}
                    </span>
                  </>
                )}
              </div>
            )}

            {current.error && (
              <div className="mb-5 rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-[12.5px] leading-relaxed text-red-400">
                {current.error}
              </div>
            )}

            {view === 'posts' && insights[platform] && <InsightsPanel insights={insights[platform]!} />}

            {current.loading && current.posts.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-ink-dim">
                <Loader2 size={16} className="animate-spin" />
                Pulling your recent posts…
              </div>
            ) : current.posts.length === 0 && !current.error ? (
              <div className="rounded-2xl border border-dashed border-border py-20 text-center text-[13px] text-ink-dim">
                No posts found on this account yet.
              </div>
            ) : view === 'retention' ? (
              <RetentionPanel posts={current.posts} />
            ) : view === 'audience' ? (
              <AudiencePanel myVideoIds={current.posts.map((p) => p.id)} />
            ) : view === 'timing' ? (
              <PostingTimePanel posts={current.posts} platform={platform} />
            ) : (
              <>
                <LinkSuggestions posts={current.posts} platform={platform} />
                <BaselineTiles baselines={baselines} platform={platform} />

                {current.posts.length > 0 && (
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11.5px] text-ink-faint">
                      {linkedCount} of {ranked.length} linked to an episode
                      {dropOffCount > 0 && (
                        <span className="text-[#c96a4a]"> · {dropOffCount} losing viewers mid-plan</span>
                      )}
                    </span>
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      className="flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold-soft px-3 py-1.5 text-[12px] font-medium text-gold transition hover:bg-gold/20 disabled:opacity-60"
                    >
                      {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      {analyzing ? 'Analysing…' : insights[platform] ? 'Re-analyse' : 'Analyse with AI'}
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {ranked.map((post, i) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      rank={i + 1}
                      episodes={episodeGroups}
                      linkedEpisode={episodeForPost(post.id)}
                      baselines={baselines}
                      onLink={(episodeId) => linkEpisodeToPost(episodeId, platform, post.id)}
                      onInspectScene={(ep, sceneId) =>
                        navigate(`/projects/${ep.projectId}/episodes/${ep.id}?scene=${sceneId}`)
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {settingsTab && <SettingsModal initialTab={settingsTab} onClose={() => setSettingsTab(null)} />}
    </div>
  )
}
