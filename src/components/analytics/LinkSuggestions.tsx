import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import { suggestLinks, STRONG_SCORE, type LinkSuggestion } from '../../lib/linkSuggest'
import type { PostPerformance, SocialPlatform } from '../../lib/social'
import { formatRelativeDate } from '../../lib/social'
import { toast } from '../../lib/toast'
import { Check, Icon, X } from '../Icon'

/**
 * Offers to link published posts back to the episodes they came from.
 *
 * Every personalised check in the app waits on these links, and doing them one
 * dropdown at a time is the chore that never gets done. Matching is proposed,
 * never applied silently — a wrong link quietly corrupts every benchmark that
 * follows, which is far worse than an unlinked post.
 */
export function LinkSuggestions({
  posts,
  platform,
}: {
  posts: PostPerformance[]
  platform: SocialPlatform
}) {
  const episodes = useAppStore((s) => s.episodes)
  const linkEpisodeToPost = useAppStore((s) => s.linkEpisodeToPost)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState(false)

  const suggestions = useMemo(
    () =>
      suggestLinks(
        episodes,
        posts.filter((p) => p.platform === platform),
      ).filter((s) => !dismissed.has(s.post.id)),
    [episodes, posts, platform, dismissed],
  )

  const strong = suggestions.filter((s) => s.score >= STRONG_SCORE)

  function apply(s: LinkSuggestion) {
    linkEpisodeToPost(s.episode.id, s.post.platform, s.post.id)
  }

  function applyAll() {
    strong.forEach(apply)
    toast.success(`Linked ${strong.length} post${strong.length === 1 ? '' : 's'} to episodes.`)
  }

  function dismiss(postId: string) {
    setDismissed((d) => new Set(d).add(postId))
  }

  if (suggestions.length === 0) return null

  const shown = expanded ? suggestions : suggestions.slice(0, 3)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-5 rounded-2xl border border-gold/30 bg-gold-soft p-5"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Icon name="wand-2" size={14} className="text-gold" />
        <span className="text-[13.5px] font-medium text-ink">
          {suggestions.length} post{suggestions.length === 1 ? '' : 's'} look like episodes you planned
        </span>
        {strong.length > 0 && (
          <button
            onClick={applyAll}
            className="ml-auto rounded-lg bg-gold px-3 py-1.5 text-[12px] font-medium text-[#141316] transition hover:bg-gold-bright"
          >
            Link {strong.length} confident match{strong.length === 1 ? '' : 'es'}
          </button>
        )}
      </div>
      <p className="mb-3.5 text-[11.5px] leading-relaxed text-ink-faint">
        Linking is what switches on the personalised draft checks — the app can only compare a draft with
        your results once it knows which video came from which plan. Check each one before accepting;
        a wrong link skews every benchmark after it.
      </p>

      <div className="space-y-2">
        {shown.map((s) => (
          <div
            key={`${s.post.id}-${s.episode.id}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-ink-dim" title={s.post.title}>
                {s.post.title}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]">
                <span className="text-ink-faint">→</span>
                <span className="truncate font-medium text-ink" title={s.episode.title}>
                  {s.episode.title}
                </span>
              </div>
              <div className="mt-0.5 text-[10.5px] text-ink-faint">
                {s.reason} · {formatRelativeDate(s.post.publishedAt)}
                {s.score < STRONG_SCORE && ' · worth a second look'}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => apply(s)}
                title="Link these"
                aria-label={`Link ${s.post.title} to ${s.episode.title}`}
                className="rounded-md border px-1.5 py-1 transition"
                style={{ borderColor: '#6bb15a', backgroundColor: '#6bb15a22', color: '#6bb15a' }}
              >
                <Check size={12} />
              </button>
              <button
                onClick={() => dismiss(s.post.id)}
                title="Not a match"
                aria-label={`Dismiss the suggestion for ${s.post.title}`}
                className="rounded-md border border-border px-1.5 py-1 text-ink-faint transition hover:text-ink"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {suggestions.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2.5 text-[11.5px] text-ink-faint underline decoration-dotted transition hover:text-ink-dim"
        >
          {expanded ? 'Show fewer' : `Show all ${suggestions.length}`}
        </button>
      )}
    </motion.div>
  )
}
