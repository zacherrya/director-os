import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { PLATFORM_SPECS, firstLineOf, type PublishDraft } from '../../lib/publishDraft'
import type { Episode, Scene } from '../../lib/types'
import { videoSrc } from '../../lib/projectFolder'
import { Icon } from '../Icon'

/**
 * What the post will actually look like where people meet it.
 *
 * The counters in the editor say a title is 72 characters; this says the last
 * eleven words are gone. Same fact, and only one of them is legible at a glance.
 *
 * End screens and cards are shown as planning guidance, never as controls. They
 * cannot be set through any API — placing one is a Studio job — so the useful
 * thing here is knowing which beats they will land on top of.
 *
 * The frame plays the cut itself where one is attached. A storyboard still is
 * only a stand-in: the timeline already previews those, and the question here is
 * whether the finished video survives the crop, not whether the plan did.
 */

/**
 * Safe zones, expressed in canvas pixels rather than percentages.
 *
 * Every number below is stated in the UI too, and both are derived from these
 * constants — so the box you see and the figure you read can never drift apart.
 * The canvas is the standard vertical master, 1080 x 1920.
 */
const CANVAS_W = 1080
const CANVAS_H = 1920

/** Instagram crops every profile-grid thumbnail to 3:4, whatever the source. */
const GRID_RATIO = 3 / 4
/** The 3:4 slice of a 9:16 frame, so this much is lost top and bottom. */
const GRID_CROP_PX = (CANVAS_H - CANVAS_W / GRID_RATIO) / 2
/** Instagram's own chrome sits over the edges — action rail, caption, handle. */
const IG_SIDE_PX = 130

/** The Shorts player floats the channel, title and sound button over the top. */
const YT_TOP_PX = 380
/** Captions, subscribe row and the scrubber live in the bottom third. */
const YT_BOTTOM_PX = Math.round(CANVAS_H * 0.3)
const YT_SIDE_PX = 120

interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

const pctX = (px: number) => (px / CANVAS_W) * 100
const pctY = (px: number) => (px / CANVAS_H) * 100

/**
 * Dims everything the platform's own interface will cover and outlines what is
 * left. The point is not decoration: it is whether a caption you burned in still
 * reads once Instagram puts a share button on top of it.
 */
function SafeZone({ insets, label }: { insets: Insets; label: string }) {
  const box: React.CSSProperties = {
    top: `${insets.top}%`,
    right: `${insets.right}%`,
    bottom: `${insets.bottom}%`,
    left: `${insets.left}%`,
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Four bands rather than one clip-path — simpler to read and to reason about. */}
      <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: `${insets.top}%` }} />
      <div className="absolute inset-x-0 bottom-0 bg-black/55" style={{ height: `${insets.bottom}%` }} />
      <div
        className="absolute left-0 bg-black/55"
        style={{ top: `${insets.top}%`, bottom: `${insets.bottom}%`, width: `${insets.left}%` }}
      />
      <div
        className="absolute right-0 bg-black/55"
        style={{ top: `${insets.top}%`, bottom: `${insets.bottom}%`, width: `${insets.right}%` }}
      />

      <div
        className="absolute border border-dashed"
        style={{ ...box, borderColor: 'rgba(211,167,92,.9)' }}
      >
        <span
          className="absolute top-0.5 left-1 text-[7.5px] font-medium tracking-wide uppercase"
          style={{ color: 'rgba(211,167,92,.95)' }}
        >
          {label}
        </span>
      </div>
    </div>
  )
}
/** End screens occupy the closing stretch of a long-form video. */
const END_SCREEN_WINDOW_S = 20
/** At or under this, YouTube treats it as a Short — no end screens, no cards. */
const SHORT_MAX_S = 60

function truncate(text: string, limit: number): { shown: string; cut: boolean } {
  const clean = text.trim()
  if (clean.length <= limit) return { shown: clean, cut: false }
  return { shown: clean.slice(0, limit).trimEnd(), cut: true }
}

/** The still chosen as the thumbnail, or the first one that exists. */
function thumbnailScene(episode: Episode): Scene | undefined {
  const chosen = episode.scenes.find((s) => s.id === episode.thumbnailSceneId && s.image)
  return chosen ?? episode.scenes.find((s) => s.image)
}

function Frame({
  children,
  ratio,
  label,
}: {
  children: React.ReactNode
  ratio: string
  label: string
}) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-border bg-surface-2"
      style={{ aspectRatio: ratio }}
      aria-label={label}
    >
      {children}
    </div>
  )
}

/**
 * The attached cut, or the best stand-in available.
 *
 * WKWebView plays H.264; a ProRes master will load and then fail to decode, so a
 * playback error falls back rather than leaving an empty black box.
 */
function CutFrame({ episode, still }: { episode: Episode; still?: Scene }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const cut = episode.cutPath

  useEffect(() => {
    let live = true
    setFailed(false)
    setSrc(null)
    if (!cut) return
    void videoSrc(cut).then((url) => {
      if (!live) return
      // A null URL means the file has moved or could not be granted — treat it
      // as a failure rather than leaving "Loading…" on screen forever.
      if (url) setSrc(url)
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [cut])

  if (cut && src && !failed) {
    return (
      <video
        src={src}
        muted
        playsInline
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        className="h-full w-full bg-black object-contain"
      />
    )
  }

  if (still?.image) {
    return (
      <>
        <img src={still.image} alt="" className="h-full w-full object-cover" />
        {cut && failed && (
          <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-[9.5px] leading-snug text-white">
            That cut will not play here — likely ProRes. Showing a storyboard still instead.
          </span>
        )}
      </>
    )
  }

  return <NoStill hasCut={!!cut} failed={failed} />
}

function NoStill({ hasCut, failed }: { hasCut?: boolean; failed?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-ink-faint">
      <Icon name={hasCut ? 'film' : 'image'} size={18} />
      <span className="px-3 text-center text-[10.5px] leading-relaxed">
        {hasCut && failed
          ? 'This cut cannot be previewed — it has moved, or it is a format the preview cannot decode such as ProRes.'
          : hasCut
            ? 'Loading the cut…'
            : 'Attach a cut from the calendar, or generate a storyboard still, to preview it here.'}
      </span>
    </div>
  )
}

/** Pick which scene still stands in as the thumbnail. */
function ThumbnailPicker({ episode }: { episode: Episode }) {
  const updateEpisode = useAppStore((s) => s.updateEpisode)
  // Only useful as a stand-in — once a cut is attached the frame plays that.
  if (episode.cutPath) return null
  const withStills = episode.scenes.filter((s) => s.image)
  if (withStills.length < 2) return null

  const current = thumbnailScene(episode)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
        Thumbnail still
      </span>
      <div className="flex flex-wrap gap-1.5">
        {withStills.map((s) => (
          <button
            key={s.id}
            onClick={() => updateEpisode(episode.id, { thumbnailSceneId: s.id })}
            title={`Scene ${s.index} · ${s.purpose}`}
            aria-label={`Use scene ${s.index} as the thumbnail`}
            className="h-9 w-12 overflow-hidden rounded border-2 transition"
            style={{ borderColor: current?.id === s.id ? 'var(--dos-gold)' : 'transparent' }}
          >
            <img src={s.image} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}

export function YouTubePreview({ episode, draft }: { episode: Episode; draft: PublishDraft }) {
  const spec = PLATFORM_SPECS.youtube
  const still = thumbnailScene(episode)
  const title = truncate(draft.title || 'Your title goes here', spec.title!.visible)
  const snippet = truncate(firstLineOf(draft.body) || 'Your description opens here.', spec.body.visible)

  const isShort = episode.length > 0 && episode.length <= SHORT_MAX_S
  const endScreenStart = Math.max(0, episode.length - END_SCREEN_WINDOW_S)
  const endScreenScenes = useMemo(
    () => episode.scenes.filter((s) => s.end > endScreenStart),
    [episode.scenes, endScreenStart],
  )

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
          In the Shorts player
        </span>
        <div className="mx-auto w-[190px]">
          <Frame ratio="9 / 16" label="Shorts preview">
            <CutFrame episode={episode} still={still} />
            <SafeZone
              label="Safe"
              insets={{
                top: pctY(YT_TOP_PX),
                bottom: pctY(YT_BOTTOM_PX),
                left: pctX(YT_SIDE_PX),
                right: pctX(YT_SIDE_PX),
              }}
            />
          </Frame>
        </div>
        <p className="text-[10.5px] leading-relaxed text-ink-faint">
          Top {YT_TOP_PX}px carries the channel name, title and sound button. The bottom{' '}
          {Math.round((YT_BOTTOM_PX / CANVAS_H) * 100)}% ({YT_BOTTOM_PX}px) is captions, the subscribe row
          and the scrubber. {YT_SIDE_PX}px each side stays clear of the action buttons.
        </p>

        <span className="mt-1 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
          In search and suggested
        </span>
        <div>
          <p className="text-[12.5px] leading-snug font-medium text-ink">
            {title.shown}
            {title.cut && <span className="text-ink-faint">…</span>}
          </p>
          <p className="mt-0.5 text-[10.5px] text-ink-faint">Your channel · New</p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-ink-dim">
            {snippet.shown}
            {snippet.cut && <span className="text-ink-faint">…</span>}
          </p>
        </div>
        {title.cut && (
          <p className="text-[10.5px] leading-relaxed" style={{ color: '#c96a4a' }}>
            The end of your title is cut here. Everything that has to be read sits above.
          </p>
        )}
      </div>

      <ThumbnailPicker episode={episode} />

      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
        <div className="mb-1 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
          End screens &amp; cards
        </div>
        {isShort ? (
          <p className="text-[10.5px] leading-relaxed text-ink-dim">
            This runs {episode.length}s, so YouTube treats it as a Short. End screens and cards do not appear
            on Shorts at all — the pinned comment is the equivalent lever.
          </p>
        ) : (
          <>
            <p className="text-[10.5px] leading-relaxed text-ink-dim">
              An end screen sits over your final {END_SCREEN_WINDOW_S} seconds — from{' '}
              {Math.floor(endScreenStart / 60)}:{String(Math.round(endScreenStart % 60)).padStart(2, '0')}{' '}
              onward, covering{' '}
              {endScreenScenes.length > 0
                ? endScreenScenes.map((s) => `scene ${s.index}`).join(' and ')
                : 'the end of the video'}
              . Leave room in frame there, or it lands on top of something.
            </p>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-faint">
              Both are placed in YouTube Studio. No API can set them, so Director OS can only tell you where
              they will fall.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export function InstagramPreview({ episode, draft }: { episode: Episode; draft: PublishDraft }) {
  const spec = PLATFORM_SPECS.instagram
  const still = thumbnailScene(episode)
  const caption = truncate(draft.body || 'Your caption goes here.', spec.firstLine.visible)

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">In the feed</span>
        <div className="mx-auto w-[190px]">
          <Frame ratio="9 / 16" label="Reel preview">
            <CutFrame episode={episode} still={still} />
            <SafeZone
              label="Safe"
              insets={{
                top: pctY(GRID_CROP_PX),
                bottom: pctY(GRID_CROP_PX),
                left: pctX(IG_SIDE_PX),
                right: pctX(IG_SIDE_PX),
              }}
            />
          </Frame>
        </div>
      </div>

      <ThumbnailPicker episode={episode} />

      <div>
        <p className="text-[11.5px] leading-relaxed text-ink-dim">
          <span className="font-medium text-ink">your.handle</span> {caption.shown}
          {caption.cut && <span className="text-ink-faint"> … more</span>}
        </p>
        {draft.firstComment.trim() && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            <span className="font-medium text-ink-dim">your.handle</span> {draft.firstComment.trim()}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
        <div className="mb-1 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
          What gets covered
        </div>
        <p className="text-[10.5px] leading-relaxed text-ink-dim">
          Top and bottom {Math.round(GRID_CROP_PX)}px go to the 3:4 profile-grid crop. Left and right{' '}
          {IG_SIDE_PX}px sit under Instagram's own chrome — the action rail, handle and caption. Anything
          outside the box is either cut or covered.
        </p>
      </div>
    </div>
  )
}
