import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import { canUploadToYouTube, hasGoogleAuth } from '../../lib/credentials'
import { checkDraft, PLATFORM_SPECS, type PublishDraft } from '../../lib/publishDraft'
import { fileName } from '../../lib/projectFolder'
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  PRIVACY_OPTIONS,
  scheduleInstant,
  uploadToYouTube,
  watchUrl,
  type Privacy,
} from '../../lib/youtubeUpload'
import { toast } from '../../lib/toast'
import type { Episode } from '../../lib/types'
import { Check, ExternalLink, Film, Loader2 } from '../Icon'

const BAD = '#c96a4a'

/**
 * Sends the attached cut to YouTube.
 *
 * Two deliberate frictions. Privacy defaults to Private, because an accidental
 * public upload notifies subscribers and cannot be taken back — and a second
 * click is required before anything leaves the machine, with the destination and
 * visibility stated on the button itself. Nothing here should ever be a surprise.
 */
export function YouTubeUpload({ episode, draft }: { episode: Episode; draft: PublishDraft }) {
  const updateEpisode = useAppStore((s) => s.updateEpisode)
  const [privacy, setPrivacy] = useState<Privacy>('private')
  const [madeForKids, setMadeForKids] = useState(false)
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY)
  // Scheduling is a real YouTube feature, not a timer in this app: the video is
  // uploaded private with a publish time and YouTube releases it itself, whether
  // or not this Mac is even on.
  const [scheduled, setScheduled] = useState(false)
  const [date, setDate] = useState(episode.scheduledDate ?? '')
  const [time, setTime] = useState(episode.scheduledTime ?? '18:00')
  const [confirming, setConfirming] = useState(false)
  const [uploading, setUploading] = useState(false)

  const spec = PLATFORM_SPECS.youtube
  const blocking = checkDraft(draft, spec).filter((i) => i.level === 'flag')
  const alreadyUp = episode.youtubeVideoId
  const cut = episode.cutPath

  const publishAt = scheduled ? scheduleInstant(date, time) : null

  const reasons: string[] = []
  if (!cut) reasons.push('No cut attached — add one from the calendar card.')
  if (scheduled && !publishAt) {
    reasons.push('Pick a date and time in the future — YouTube will not accept a past one.')
  }
  if (!hasGoogleAuth()) reasons.push('YouTube is not connected. Connect it in Settings → YouTube.')
  else if (!canUploadToYouTube()) {
    reasons.push('Your saved Google permission predates uploading. Reconnect in Settings → YouTube to grant it.')
  }
  for (const b of blocking) reasons.push(b.message)

  const ready = reasons.length === 0 && !uploading

  async function run() {
    if (!cut) return
    setUploading(true)
    setConfirming(false)
    try {
      const videoId = await uploadToYouTube({
        filePath: cut,
        draft,
        // A scheduled video has to go up private; YouTube flips it itself.
        privacy: scheduled ? 'private' : privacy,
        madeForKids,
        categoryId,
        publishAt: publishAt ?? undefined,
      })
      // Recording the id links this episode to the published video, which is what
      // switches on retention and the personalised draft checks for it later.
      updateEpisode(episode.id, {
        youtubeVideoId: videoId,
        // Keep the calendar honest: a scheduled video is not published yet.
        status: scheduled ? 'Ready' : 'Published',
        ...(scheduled
          ? { scheduledDate: date, scheduledTime: time, youtubePublishAt: publishAt ?? undefined }
          : {}),
      })
      toast.success(scheduled ? `Scheduled for ${date} at ${time}.` : 'Uploaded to YouTube.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  if (alreadyUp) {
    // Uploaded but held by YouTube until its publish time — saying "published"
    // here would be plainly untrue while the video is still private.
    const waiting =
      episode.youtubePublishAt && new Date(episode.youtubePublishAt).getTime() > Date.now()
        ? new Date(episode.youtubePublishAt)
        : null

    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2.5"
        style={
          waiting
            ? { borderColor: 'rgba(211,167,92,.3)', backgroundColor: 'rgba(211,167,92,.1)' }
            : { borderColor: 'rgba(107,177,90,.3)', backgroundColor: 'rgba(107,177,90,.1)' }
        }
      >
        <Check size={13} style={{ color: waiting ? '#d3a75c' : '#6bb15a' }} />
        <span className="text-[12px] text-ink-dim">
          {waiting
            ? `Uploaded. YouTube publishes it ${waiting.toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}.`
            : 'Published to YouTube.'}
        </span>
        <a
          href={watchUrl(alreadyUp)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[11.5px] text-gold underline decoration-dotted"
        >
          {waiting ? 'Open in Studio' : 'Open the video'} <ExternalLink size={10} />
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border-soft pt-4">
      <div className="flex items-center gap-2">
        <Film size={13} className="text-gold" />
        <span className="text-[12.5px] font-medium text-ink">Upload to YouTube</span>
      </div>

      <div className={`flex flex-col gap-1.5 ${scheduled ? 'hidden' : ''}`}>
        <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Visibility</span>
        <div className="flex flex-wrap gap-1.5">
          {PRIVACY_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                setPrivacy(o.value)
                setConfirming(false)
              }}
              title={o.detail}
              className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition ${
                privacy === o.value
                  ? 'border-gold bg-gold-soft text-gold'
                  : 'border-border text-ink-dim hover:border-ink-faint hover:text-ink'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-ink-faint">
          {PRIVACY_OPTIONS.find((o) => o.value === privacy)?.detail}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Category</span>
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setConfirming(false)
          }}
          className="w-full cursor-pointer rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-gold"
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] leading-relaxed text-ink-faint">
          YouTube refuses an upload without one.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-dim">
          <input
            type="checkbox"
            checked={scheduled}
            onChange={(e) => {
              setScheduled(e.target.checked)
              setConfirming(false)
            }}
            className="mt-0.5 accent-[#d3a75c]"
          />
          <span>
            Schedule it instead of publishing now
            <span className="block text-[11px] text-ink-faint">
              YouTube holds it and publishes at the time you pick. Your Mac does not need to be on.
            </span>
          </span>
        </label>
        {scheduled && (
          <div className="ml-6 flex flex-wrap gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                setConfirming(false)
              }}
              className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-gold"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value)
                setConfirming(false)
              }}
              className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-gold"
            />
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-dim">
        <input
          type="checkbox"
          checked={madeForKids}
          onChange={(e) => {
            setMadeForKids(e.target.checked)
            setConfirming(false)
          }}
          className="mt-0.5 accent-[#d3a75c]"
        />
        <span>
          Made for kids
          <span className="block text-[11px] text-ink-faint">
            YouTube requires an answer either way. Getting it wrong has legal consequences, so it is asked
            plainly rather than assumed.
          </span>
        </span>
      </label>

      {cut && (
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-ink-dim">
          Sending <span className="font-medium text-ink">{fileName(cut)}</span>
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
            {scheduled ? (
              <>
                Upload <span className="font-medium">{draft.title.trim() || 'this video'}</span> now and have
                YouTube publish it on <span className="font-medium">{date}</span> at{' '}
                <span className="font-medium">{time}</span>?
              </>
            ) : (
              <>
                Upload <span className="font-medium">{draft.title.trim() || 'this video'}</span> to your
                channel as <span className="font-medium">{privacy}</span>?
                {privacy === 'public' && ' It goes live straight away and subscribers may be notified.'}
              </>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={run}
              className="rounded-lg bg-gold px-3 py-1.5 text-[12px] font-medium text-[#141316] transition hover:bg-gold-bright"
            >
              Yes, upload
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
          {uploading && <Loader2 size={13} className="animate-spin" />}
          {uploading ? 'Uploading…' : scheduled ? 'Schedule upload' : `Upload as ${privacy}`}
        </button>
      )}

      {uploading && (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Streaming the file to YouTube. Leave this tab open — the upload stops if the app quits.
        </p>
      )}
    </div>
  )
}
