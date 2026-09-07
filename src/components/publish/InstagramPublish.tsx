import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import { canPublishToInstagram } from '../../lib/credentials'
import { checkDraft, PLATFORM_SPECS, type PublishDraft } from '../../lib/publishDraft'
import { fileName } from '../../lib/projectFolder'
import { publishReel, STAGE_LABEL, type PublishStage } from '../../lib/instagramPublish'
import { toast } from '../../lib/toast'
import type { Episode } from '../../lib/types'
import { Check, ExternalLink, Icon, Loader2 } from '../Icon'

/**
 * CURRENTLY UNMOUNTED. Nothing renders this — the Post tab shows a short note
 * instead. Kept intact rather than deleted: the pipeline behind it is complete
 * and correct, and only the Meta connection is missing. Reaching it again means
 * a Meta app on the Facebook Login path, or switching to `video_url` publishing
 * with the file staged somewhere public.
 */

const BAD = '#c96a4a'
/** Reels outside this window are published but never surface in the Reels tab. */
const REELS_MIN_S = 5
const REELS_MAX_S = 90

export function InstagramPublish({ episode, draft }: { episode: Episode; draft: PublishDraft }) {
  const updateEpisode = useAppStore((s) => s.updateEpisode)
  const [shareToFeed, setShareToFeed] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [stage, setStage] = useState<PublishStage | null>(null)

  const spec = PLATFORM_SPECS.instagram
  const blocking = checkDraft(draft, spec).filter((i) => i.level === 'flag')
  const alreadyUp = episode.instagramMediaId
  const cut = episode.cutPath
  const busy = stage !== null

  // Not being connected is a choice, not a fault, so it reads as a note rather
  // than joining the red list of things that are actually wrong with the draft.
  const connected = canPublishToInstagram()

  const reasons: string[] = []
  if (!cut) reasons.push('No cut attached — add one from the calendar card.')
  for (const b of blocking) reasons.push(b.message)

  // Length is a warning rather than a blocker: a reel outside the window still
  // posts, it just will not be shown in the Reels tab.
  const length = episode.length
  const outsideReelWindow = length > 0 && (length < REELS_MIN_S || length > REELS_MAX_S)

  const ready = connected && reasons.length === 0 && !busy

  async function run() {
    if (!cut) return
    setConfirming(false)
    setStage('creating')
    try {
      const result = await publishReel({
        filePath: cut,
        caption: draft.body.trim(),
        firstComment: draft.firstComment,
        shareToFeed,
        onStage: setStage,
      })
      updateEpisode(episode.id, {
        instagramMediaId: result.mediaId,
        instagramPermalink: result.permalink,
        status: 'Published',
      })
      if (result.commentError) {
        toast.error(`Reel published, but the first comment did not post: ${result.commentError}`)
      } else {
        toast.success('Published to Instagram.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setStage(null)
    }
  }

  if (alreadyUp) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#6bb15a]/30 bg-[#6bb15a]/10 px-3.5 py-2.5">
        <Check size={13} style={{ color: '#6bb15a' }} />
        <span className="text-[12px] text-ink-dim">Published to Instagram.</span>
        {episode.instagramPermalink ? (
          <a
            href={episode.instagramPermalink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11.5px] text-gold underline decoration-dotted"
          >
            Open the reel <ExternalLink size={10} />
          </a>
        ) : (
          // Published before permalinks were stored, or Meta declined to give one.
          <span className="font-mono text-[11px] text-ink-faint">{alreadyUp}</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border-soft pt-4">
      <div className="flex items-center gap-2">
        <Icon name="camera" size={13} className="text-gold" />
        <span className="text-[12.5px] font-medium text-ink">Publish to Instagram</span>
      </div>

      {!connected && (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-dim">
          Direct publishing to Instagram is not set up. Copy the caption and first comment across by hand for
          now — Meta only offers upload-from-app on its Facebook Login path, which is a separate setup on your
          Meta account. Settings → Instagram has what it would take, whenever it is worth the bother.
        </p>
      )}

      <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-dim">
        <input
          type="checkbox"
          checked={shareToFeed}
          onChange={(e) => {
            setShareToFeed(e.target.checked)
            setConfirming(false)
          }}
          className="mt-0.5 accent-[#d3a75c]"
        />
        <span>
          Also show on my profile grid
          <span className="block text-[11px] text-ink-faint">
            Off means it appears in Reels and in feeds, but not on your profile's grid.
          </span>
        </span>
      </label>

      {cut && (
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-ink-dim">
          Sending <span className="font-medium text-ink">{fileName(cut)}</span>
        </div>
      )}

      {outsideReelWindow && (
        <div className="flex items-start gap-1.5 text-[11.5px] leading-relaxed">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: '#d3a75c' }} />
          <span className="text-ink-dim">
            This runs {length}s. Only reels between {REELS_MIN_S} and {REELS_MAX_S} seconds are eligible for the
            Reels tab — it will still post, but it will not surface there.
          </span>
        </div>
      )}

      {reasons.length > 0 && (
        <div className="flex flex-col gap-1">
          {reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: BAD }} />
              <span className="text-ink-dim">{r}</span>
            </div>
          ))}
        </div>
      )}

      {confirming ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-2 rounded-xl border border-gold/40 bg-gold-soft p-3"
        >
          <p className="text-[12px] leading-relaxed text-ink">
            Publish this reel to Instagram now? It goes live immediately — Instagram has no private or
            scheduled option through the API.
            {draft.firstComment.trim() && ' Your first comment posts straight after.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={run}
              className="rounded-lg bg-gold px-3 py-1.5 text-[12px] font-medium text-[#141316] transition hover:bg-gold-bright"
            >
              Yes, publish
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-ink-dim transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={!ready}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-gold px-3.5 py-2 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-40"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {busy ? STAGE_LABEL[stage] : 'Publish reel'}
        </button>
      )}

      {busy && (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          {stage === 'processing'
            ? 'Instagram transcodes the video before it can be published. This can take a couple of minutes.'
            : 'Leave this tab open — publishing stops if the app quits.'}
        </p>
      )}
    </div>
  )
}
