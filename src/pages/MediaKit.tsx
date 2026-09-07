import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { computeBaselines } from '../lib/retention'
import { hasInstagramToken, hasYouTube } from '../lib/credentials'
import { fetchInstagramAccount, fetchInstagramPosts } from '../lib/instagram'
import { fetchYouTubeAccount, fetchYouTubePosts } from '../lib/youtube'
import {
  engagementRate,
  formatCount,
  PLATFORM_LABEL,
  type PostPerformance,
  type SocialPlatform,
} from '../lib/social'
import {
  bestTravel,
  exportMediaKitPdf,
  MAX_FEATURED,
  selectFeatured,
  travelStat,
  type MediaKit as Kit,
  type PlatformSnapshot,
} from '../lib/mediaKit'
import { SettingsModal } from '../components/SettingsModal'
import { toast } from '../lib/toast'
import { Check, Download, ExternalLink, Icon, Loader2 } from '../components/Icon'

const PLATFORMS: SocialPlatform[] = ['instagram', 'youtube']

/** Matches the Analytics window, so the two pages quote the same medians. */
const SAMPLE_SIZE = 10

const PLATFORM_ICON: Record<SocialPlatform, string> = { instagram: 'camera', youtube: 'film' }
const AUDIENCE_NOUN: Record<SocialPlatform, string> = {
  instagram: 'followers',
  youtube: 'subscribers',
}

type Loaded = { snapshot: PlatformSnapshot | null; error: string | null }

function Field({
  label,
  value,
  onChange,
  placeholder,
  big,
  textarea,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  big?: boolean
  textarea?: boolean
}) {
  const shared =
    'w-full rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-ink placeholder:text-ink-faint transition hover:border-border focus:border-gold focus:bg-surface-2'
  return (
    <label className="block">
      <span className="mb-0.5 block px-2.5 text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">
        {label}
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={`${shared} resize-none text-[13px] leading-relaxed`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${shared} ${big ? 'font-display text-[24px] tracking-tight' : 'text-[13px]'}`}
        />
      )}
    </label>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">{label}</div>
      <div className="mt-1 text-[21px] font-semibold tracking-tight text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-ink-faint">{note}</div>
    </div>
  )
}

function PlatformCard({ s }: { s: PlatformSnapshot }) {
  const n = s.baselines.sampleSize
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <Icon name={PLATFORM_ICON[s.platform]} size={14} className="text-gold" />
          <span className="text-[13.5px] font-medium text-ink">{PLATFORM_LABEL[s.platform]}</span>
          <span className="text-[11.5px] text-ink-faint">{s.handle}</span>
        </div>
        <span className="text-[10.5px] tracking-wide text-ink-faint uppercase">
          median of {n} post{n === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Audience" value={formatCount(s.audience)} note={AUDIENCE_NOUN[s.platform]} />
        <Metric label="Views" value={formatCount(s.baselines.medianViews)} note="per post" />
        <Metric
          label="Engagement"
          value={s.baselines.medianEngagement === null ? '—' : `${s.baselines.medianEngagement.toFixed(1)}%`}
          note="interactions ÷ views"
        />
        {s.baselines.medianReachMultiple !== null && (
          <Metric
            label="Reach"
            value={`${s.baselines.medianReachMultiple.toFixed(1)}×`}
            note="of follower count"
          />
        )}
      </div>

      {!s.baselines.reliable && (
        <p className="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-ink-dim">
          {n === 0
            ? 'No posts came back for this account, so there is nothing to quote yet.'
            : `A median over ${n} post${n === 1 ? '' : 's'} is really just one of the numbers. It goes on the kit with its sample size attached, but a brand checking your account will see the same thin history.`}
        </p>
      )}
    </div>
  )
}

function FeaturedPost({
  post,
  pinned,
  onToggle,
}: {
  post: PostPerformance
  pinned: boolean
  onToggle: () => void
}) {
  const rate = engagementRate(post)
  return (
    <div
      className={`flex gap-3 rounded-xl border p-3 transition ${
        pinned ? 'border-gold/50 bg-gold-soft' : 'border-border bg-surface hover:border-ink-faint'
      }`}
    >
      {post.thumbnail ? (
        <img src={post.thumbnail} alt="" className="h-[86px] w-[48px] shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-[86px] w-[48px] shrink-0 rounded-md bg-surface-2" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] tracking-wide text-ink-faint uppercase">
          {PLATFORM_LABEL[post.platform]} · {post.format}
        </div>
        <div className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink">{post.title || 'Untitled'}</div>
        <div className="mt-2 text-[11px] text-ink-dim">
          {formatCount(post.views)} views · {rate === null ? '—' : `${rate.toFixed(1)}%`} engagement
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between">
        <a
          href={post.permalink}
          target="_blank"
          rel="noreferrer"
          title="Open on the platform"
          className="rounded-md p-1 text-ink-faint transition hover:text-ink"
        >
          <ExternalLink size={12} />
        </a>
        <button
          onClick={onToggle}
          title={pinned ? 'Remove from the kit' : 'Put this on the kit'}
          className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
            pinned ? 'text-gold' : 'text-ink-faint hover:text-ink'
          }`}
        >
          {pinned ? 'On kit' : 'Add'}
        </button>
      </div>
    </div>
  )
}

/**
 * What the kit will lead with. Shown here because the claim is the one part of
 * the document that depends on the numbers rather than on her copy — she should
 * see it before a brand does, including when it is not available.
 */
function Headline({ platforms }: { platforms: PlatformSnapshot[] }) {
  const travel = bestTravel(platforms)
  const all = platforms.map(travelStat).filter((t) => t !== null)

  if (travel) {
    return (
      <div className="mb-5 rounded-2xl border border-gold/40 bg-gold-soft p-5">
        <div className="text-[10.5px] font-medium tracking-wide text-gold uppercase">The kit leads with</div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-display text-[38px] leading-none tracking-tight text-ink">
            {travel.multiple.toFixed(1)}×
          </span>
          <span className="text-[13px] leading-relaxed text-ink-dim">
            A typical {PLATFORM_LABEL[travel.platform]} post is seen by {travel.multiple.toFixed(1)}× as many
            people as the account has {AUDIENCE_NOUN[travel.platform]}.
          </span>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
          Median of {travel.sampleSize} post{travel.sampleSize === 1 ? '' : 's'} ·{' '}
          {travel.basis === 'reach'
            ? 'reach against follower count'
            : 'views against subscriber count, since YouTube reports no reach'}
        </p>
      </div>
    )
  }

  return (
    <div className="mb-5 rounded-2xl border border-border bg-surface-2 p-5">
      <div className="text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">The kit leads with</div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
        Your strongest median views, not a claim about travelling past your following.
        {all.length > 0
          ? ` A typical post currently reaches ${all
              .map((t) => `${t!.multiple.toFixed(1)}× on ${PLATFORM_LABEL[t!.platform]}`)
              .join(', ')} — under 1×, so the kit does not say the work travels beyond your audience.`
          : ' There is not enough published history yet to work out how far a typical post travels.'}
      </p>
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-faint">
        That is deliberate. It is the first thing a brand checks, and a kit that claims it without the numbers
        behind it is the one that gets caught.
      </p>
    </div>
  )
}

export function MediaKit({ embedded = false }: { embedded?: boolean } = {}) {
  const profile = useAppStore((s) => s.mediaKit)
  const updateMediaKit = useAppStore((s) => s.updateMediaKit)

  const [loaded, setLoaded] = useState<Record<SocialPlatform, Loaded>>({
    instagram: { snapshot: null, error: null },
    youtube: { snapshot: null, error: null },
  })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Which accounts are connected is read at load time rather than memoised:
  // credentials live in localStorage, so nothing tells React they changed. The
  // effect below re-runs whenever the Settings modal closes.
  const [connected, setConnected] = useState<SocialPlatform[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const live = PLATFORMS.filter((p) => (p === 'instagram' ? hasInstagramToken() : hasYouTube()))
    setConnected(live)
    const results = await Promise.all(
      live.map(async (platform): Promise<[SocialPlatform, Loaded]> => {
        try {
          const [account, posts] =
            platform === 'instagram'
              ? await Promise.all([fetchInstagramAccount(), fetchInstagramPosts(SAMPLE_SIZE)])
              : await Promise.all([fetchYouTubeAccount(), fetchYouTubePosts(SAMPLE_SIZE)])
          const audience = 'followers' in account ? account.followers : account.subscribers
          const handle = 'username' in account ? `@${account.username}` : account.title
          return [
            platform,
            {
              snapshot: { platform, handle, audience, posts, baselines: computeBaselines(posts, audience) },
              error: null,
            },
          ]
        } catch (err) {
          return [platform, { snapshot: null, error: err instanceof Error ? err.message : 'Could not load.' }]
        }
      }),
    )
    setLoaded((cur) => {
      const next = { ...cur }
      results.forEach(([p, r]) => {
        next[p] = r
      })
      return next
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    if (settingsOpen) return
    void load()
  }, [load, settingsOpen])

  const snapshots = useMemo(
    () => connected.map((p) => loaded[p].snapshot).filter((s): s is PlatformSnapshot => s !== null),
    [connected, loaded],
  )
  const allPosts = useMemo(() => snapshots.flatMap((s) => s.posts), [snapshots])
  const featured = useMemo(() => selectFeatured(snapshots, profile), [snapshots, profile])
  const featuredIds = useMemo(() => new Set(featured.map((p) => p.id)), [featured])
  const autoPicked = profile.featuredPostIds.length === 0

  function togglePinned(post: PostPerformance) {
    // The first pin has to start from what is on the kit right now, or clicking
    // "Add" on a seventh post would silently throw the automatic six away.
    const current = autoPicked ? featured.map((p) => p.id) : profile.featuredPostIds
    if (current.includes(post.id)) {
      updateMediaKit({ featuredPostIds: current.filter((id) => id !== post.id) })
      return
    }
    if (current.length >= MAX_FEATURED) {
      toast.error(`A kit holds ${MAX_FEATURED} pieces of work. Take one off first.`)
      return
    }
    updateMediaKit({ featuredPostIds: [...current, post.id] })
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const kit: Kit = { profile, platforms: snapshots, featured, generatedAt: new Date() }
      await exportMediaKitPdf(kit)
    } catch (err) {
      console.error('Media kit export failed', err)
      toast.error(err instanceof Error ? err.message : 'The media kit could not be exported.')
    } finally {
      setExporting(false)
    }
  }

  const failures = PLATFORMS.filter((p) => loaded[p].error)

  return (
    <div className="h-full overflow-y-auto">
      <div className={`mx-auto max-w-[900px] ${embedded ? 'px-10 pt-6 pb-10' : 'px-10 py-10'}`}>
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            {!embedded && <h1 className="font-display text-[26px] tracking-tight text-ink">Media Kit</h1>}
            <p className={`max-w-[520px] text-[13px] leading-relaxed text-ink-dim ${embedded ? '' : 'mt-0.5'}`}>
              The one page a brand asks for before it talks about money. Every number is read from your real
              published posts, with the sample size attached — nothing here is typed in or rounded up.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || snapshots.length === 0}
            title={snapshots.length === 0 ? 'Connect an account first' : 'Save the kit as a one-page PDF'}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2.5 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? 'Building…' : 'Export PDF'}
          </button>
        </div>

        <div className="mb-8 rounded-2xl border border-border bg-surface p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                label="Name"
                big
                value={profile.displayName}
                onChange={(v) => updateMediaKit({ displayName: v })}
                placeholder="Styled by Shivangi"
              />
            </div>
            <div className="sm:col-span-2">
              <Field
                label="What you make"
                textarea
                value={profile.tagline}
                onChange={(v) => updateMediaKit({ tagline: v })}
                placeholder="Short-form styling lessons for women who want to get dressed faster."
              />
            </div>
            <Field
              label="Contact"
              value={profile.contactEmail}
              onChange={(v) => updateMediaKit({ contactEmail: v })}
              placeholder="hello@example.com"
            />
            <Field
              label="Based in"
              value={profile.location}
              onChange={(v) => updateMediaKit({ location: v })}
              placeholder="London"
            />
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-[16px] text-ink">The story</h2>
            <span className="text-[11px] text-ink-faint">Anything left blank is left off the kit</span>
          </div>
          <div className="grid gap-3">
            <Field
              label="Positioning"
              textarea
              value={profile.positioning}
              onChange={(v) => updateMediaKit({ positioning: v })}
              placeholder="Personal styling and fashion education for women who want to understand what works for them, look more put-together and feel more confident without making fashion complicated."
            />
            <Field
              label="Who it reaches"
              textarea
              value={profile.audienceNote}
              onChange={(v) => updateMediaKit({ audienceNote: v })}
              placeholder="Women in their late twenties and thirties who are rebuilding a wardrobe rather than chasing trends."
            />
            <Field
              label="Working together"
              textarea
              value={profile.collaborationNote}
              onChange={(v) => updateMediaKit({ collaborationNote: v })}
              placeholder="Styling-led Reels, try-on edits, and long-form pieces where a product has to earn its place in an outfit."
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-16 text-[12.5px] text-ink-dim">
            <Loader2 size={14} className="animate-spin" />
            Reading your accounts…
          </div>
        ) : (
          <>
            {connected.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-ink-faint">
                  <Icon name="camera" size={20} />
                </div>
                <p className="text-[15px] font-medium text-ink">Nothing to quote yet</p>
                <p className="mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed text-ink-dim">
                  The kit is built from your own published performance, so it needs a connected account before it
                  has anything to say.
                </p>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="mt-5 rounded-lg bg-gold px-4 py-2 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright"
                >
                  Add credentials
                </button>
              </div>
            )}

            {failures.length > 0 && (
              <div className="mb-5 flex flex-col gap-1 rounded-xl border border-border bg-surface-2 px-4 py-3">
                {failures.map((p) => (
                  <p key={p} className="text-[11.5px] leading-relaxed text-ink-dim">
                    <span className="font-medium text-ink">{PLATFORM_LABEL[p]} did not load.</span>{' '}
                    {loaded[p].error} The kit is built without it.
                  </p>
                ))}
              </div>
            )}

            {snapshots.length > 0 && <Headline platforms={snapshots} />}

            {snapshots.length > 0 && (
              <div className="flex flex-col gap-4">
                {snapshots.map((s) => (
                  <PlatformCard key={s.platform} s={s} />
                ))}
              </div>
            )}

            {allPosts.length > 0 && (
              <div className="mt-9">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-display text-[18px] text-ink">Selected work</h2>
                  <span className="text-[11.5px] text-ink-faint">
                    {autoPicked
                      ? `Your ${featured.length} most-viewed, until you pick your own`
                      : `${featured.length} of ${MAX_FEATURED} pinned`}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {allPosts.map((post) => (
                    <FeaturedPost
                      key={`${post.platform}-${post.id}`}
                      post={post}
                      pinned={featuredIds.has(post.id)}
                      onToggle={() => togglePinned(post)}
                    />
                  ))}
                </div>
                {!autoPicked && (
                  <button
                    onClick={() => updateMediaKit({ featuredPostIds: [] })}
                    className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-ink-dim transition hover:text-ink"
                  >
                    <Check size={12} />
                    Go back to the most-viewed
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {settingsOpen && <SettingsModal initialTab="Instagram" onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
