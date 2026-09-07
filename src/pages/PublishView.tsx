import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import { TimelineHeader } from '../components/timeline/TimelineHeader'
import {
  assembleForCopy,
  checkDraft,
  emptyDraft,
  firstLineOf,
  parseTags,
  PLATFORM_SPECS,
  type DraftIssue,
  type PlatformSpec,
  type PublishDraft,
} from '../lib/publishDraft'
import { writeCaption } from '../lib/captionWriter'
import { hasOpenAiKey } from '../lib/credentials'
import { rulesForProject } from '../lib/playbook'
import type { SocialPlatform } from '../lib/social'
import { toast } from '../lib/toast'
import { InstagramPreview, YouTubePreview } from '../components/publish/PostPreview'
import { YouTubeUpload } from '../components/publish/YouTubeUpload'
import { Check, Copy, Icon, Loader2, Sparkles } from '../components/Icon'

const PLATFORMS: SocialPlatform[] = ['instagram', 'youtube']

/** Counts against the point where the platform actually truncates. */
function Counter({ value, limit, label }: { value: number; limit: number; label: string }) {
  const over = value > limit
  return (
    <span
      className="font-mono text-[10.5px] tabular-nums"
      style={{ color: over ? '#c96a4a' : 'var(--dos-ink-faint)' }}
      title={over ? `Past ${limit}, the ${label} gets cut off` : `${limit} characters show before the ${label} is cut`}
    >
      {value}/{limit}
    </span>
  )
}

function Field({
  label,
  hint,
  value,
  onChange,
  rows,
  counter,
  mono,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  rows: number
  counter?: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">{label}</label>
        {counter}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-gold ${
          mono ? 'font-mono text-[12px]' : ''
        }`}
      />
      {hint && <p className="text-[11px] leading-relaxed text-ink-faint">{hint}</p>}
    </div>
  )
}

function IssueList({ issues }: { issues: DraftIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[11.5px] text-[#6bb15a]">
        <Check size={12} />
        Nothing will be cut off or refused.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {issues.map((i, n) => (
        <div key={n} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed">
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: i.level === 'flag' ? '#c96a4a' : '#d3a75c' }}
          />
          <span className="text-ink-dim">{i.message}</span>
        </div>
      ))}
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Could not reach the clipboard.')
    }
  }

  return (
    <button
      onClick={copy}
      disabled={!text.trim()}
      className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-medium text-ink-dim transition hover:border-gold hover:text-ink disabled:opacity-40"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  )
}

function PlatformEditor({
  spec,
  draft,
  onChange,
  onGenerate,
  generating,
  footer,
}: {
  spec: PlatformSpec
  draft: PublishDraft
  onChange: (next: PublishDraft) => void
  onGenerate: () => void
  generating: boolean
  footer?: React.ReactNode
}) {
  const issues = useMemo(() => checkDraft(draft, spec), [draft, spec])
  const [tagText, setTagText] = useState(draft.tags.map((t) => `#${t}`).join(' '))

  function commitTags(raw: string) {
    setTagText(raw)
    onChange({ ...draft, tags: parseTags(raw) })
  }

  const opener = firstLineOf(draft.body)

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name={spec.platform === 'instagram' ? 'camera' : 'film'} size={15} className="text-gold" />
          <span className="text-[14px] font-medium text-ink">{spec.label}</span>
        </div>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold-soft px-3 py-1.5 text-[12px] font-medium text-gold transition hover:bg-gold/20 disabled:opacity-60"
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {generating ? 'Writing…' : draft.body ? 'Rewrite' : 'Draft from the script'}
        </button>
      </div>

      {spec.title && (
        <Field
          label="Title"
          value={draft.title}
          onChange={(title) => onChange({ ...draft, title })}
          rows={2}
          counter={<Counter value={draft.title.trim().length} limit={spec.title.visible} label="title" />}
          hint="Works beside the thumbnail, not instead of it. The end is what gets clipped, so put the payoff first."
        />
      )}

      <Field
        label={spec.bodyLabel}
        value={draft.body}
        onChange={(body) => onChange({ ...draft, body })}
        rows={spec.platform === 'youtube' ? 8 : 6}
        counter={<Counter value={opener.length} limit={spec.firstLine.visible} label={spec.firstLine.label} />}
        hint={
          spec.platform === 'instagram'
            ? 'The counter measures your first line only — that is all anyone sees before tapping “more”.'
            : 'The counter measures your opening line, which is what search results show under the title.'
        }
      />

      {spec.hasFirstComment && (
        <Field
          label="First comment"
          value={draft.firstComment}
          onChange={(firstComment) => onChange({ ...draft, firstComment })}
          rows={3}
          hint="Where hashtags go so the caption stays readable. Post it yourself right after publishing."
        />
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Hashtags</label>
          <span
            className="font-mono text-[10.5px] tabular-nums"
            style={{ color: draft.tags.length > spec.maxTags ? '#c96a4a' : 'var(--dos-ink-faint)' }}
          >
            {draft.tags.length}/{spec.maxTags}
          </span>
        </div>
        <input
          value={tagText}
          onChange={(e) => commitTags(e.target.value)}
          placeholder="#capsulewardrobe #linen"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-gold"
        />
        {draft.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {draft.tags.map((t) => (
              <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-dim">
                #{t}
              </span>
            ))}
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-ink-faint">
          {spec.suggestedTags} specific tags beat {spec.maxTags} broad ones. Tags nobody searches cost you nothing
          and gain you nothing.
        </p>
      </div>

      <div className="border-t border-border-soft pt-3">
        <IssueList issues={issues} />
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={assembleForCopy(draft, spec)} label={`Copy ${spec.bodyLabel.toLowerCase()}`} />
        {spec.title && <CopyButton text={draft.title} label="Copy title" />}
        {spec.hasFirstComment && <CopyButton text={draft.firstComment} label="Copy first comment" />}
        {!spec.hasFirstComment && draft.tags.length > 0 && (
          <CopyButton text={draft.tags.map((t) => `#${t}`).join(' ')} label="Copy tags" />
        )}
      </div>

      {footer}
    </div>
  )
}

export function PublishView() {
  const { projectId, episodeId } = useParams()
  const projects = useAppStore((s) => s.projects)
  const episodes = useAppStore((s) => s.episodes)
  const playbook = useAppStore((s) => s.playbook)
  const audienceVocabulary = useAppStore((s) => s.audienceVocabulary)
  const updateEpisode = useAppStore((s) => s.updateEpisode)
  const [generating, setGenerating] = useState<SocialPlatform | null>(null)

  const project = projects.find((p) => p.id === projectId)
  const episode = episodes.find((e) => e.id === episodeId)

  if (!project || !episode) {
    return <div className="p-10 text-[13px] text-ink-dim">Episode not found.</div>
  }

  const publishing = episode.publishing ?? {}

  function update(platform: SocialPlatform, next: PublishDraft) {
    updateEpisode(episode!.id, { publishing: { ...publishing, [platform]: next } })
  }

  async function generate(platform: SocialPlatform) {
    if (!hasOpenAiKey()) {
      toast.error('Add an OpenAI API key in Settings to draft captions.')
      return
    }
    setGenerating(platform)
    try {
      const draft = await writeCaption({
        episode: episode!,
        platform,
        rules: rulesForProject(playbook, episode!.projectId),
        // Empty until the Audience tab has some on-target channels marked.
        neighbourhoodVocabulary: audienceVocabulary.length > 0 ? audienceVocabulary : undefined,
      })
      update(platform, draft)
      toast.success(`${PLATFORM_SPECS[platform].label} draft written.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not draft the caption.')
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TimelineHeader project={project} episode={episode} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1180px] px-10 py-8">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mb-6"
          >
            <h2 className="font-display text-[22px] tracking-tight text-ink">The post</h2>
            <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-ink-dim">
              The script is what gets filmed. This is what goes out with it — written from the beats you already
              wrote, and measured against where each platform actually cuts text off.
            </p>
          </motion.div>

          <div className="flex flex-col gap-4">
            {PLATFORMS.map((platform) => {
              const draft = publishing[platform] ?? emptyDraft()
              return (
                <div
                  key={platform}
                  className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]"
                >
                  <PlatformEditor
                    spec={PLATFORM_SPECS[platform]}
                    draft={draft}
                    onChange={(next) => update(platform, next)}
                    onGenerate={() => generate(platform)}
                    generating={generating === platform}
                    footer={
                      platform === 'youtube' ? (
                        <YouTubeUpload episode={episode!} draft={draft} />
                      ) : (
                        // Instagram has no publish path here: Meta offers upload
                        // from an app only on its Facebook Login side, which this
                        // Meta app cannot use. Copy buttons above are the route.
                        <p className="border-t border-border-soft pt-4 text-[11.5px] leading-relaxed text-ink-faint">
                          Copy these across when you post. Instagram only allows publishing from an app on
                          Meta's Facebook Login path, which your Meta app is not built on — so there is
                          nothing to connect here rather than something missing.
                        </p>
                      )
                    }
                  />
                  <aside className="rounded-2xl border border-border bg-surface p-4">
                    <div className="mb-3 text-[12.5px] font-medium text-ink">Preview</div>
                    {platform === 'youtube' ? (
                      <YouTubePreview episode={episode!} draft={draft} />
                    ) : (
                      <InstagramPreview episode={episode!} draft={draft} />
                    )}
                  </aside>
                </div>
              )
            })}
          </div>

          <p className="mt-5 text-[11.5px] leading-relaxed text-ink-faint">
            YouTube uploads and schedules directly from here. Nothing is sent anywhere except to YouTube
            when you press upload, and to OpenAI when you press Draft.
          </p>
        </div>
      </div>
    </div>
  )
}
