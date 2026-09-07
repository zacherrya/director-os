import { AnimatePresence, motion, type TargetAndTransition } from 'framer-motion'
import type { CameraMovement, Episode, OnScreenText, Scene } from '../../lib/types'
import { PURPOSE_COLOR } from '../../lib/types'
import { Icon } from '../Icon'

const ASPECT_RATIO: Record<Episode['format'], number> = {
  '9:16': 9 / 16,
  '1:1': 1,
  '16:9': 16 / 9,
}

const TEXT_VARIANTS: Record<string, { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition }> = {
  'Fade In': { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  'Fade Out': { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  'Slide In': { initial: { opacity: 0, x: -24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 24 } },
  'Slide Up': { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } },
  'Pop In': { initial: { opacity: 0, scale: 0.75 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.9 } },
  'Write On': {
    initial: { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
    animate: { opacity: 1, clipPath: 'inset(0 0% 0 0)' },
    exit: { opacity: 0 },
  },
}

function findActiveScene(episode: Episode, playhead: number): Scene | undefined {
  return episode.scenes.find((s) => playhead >= s.start && playhead < s.end) ?? episode.scenes.at(-1)
}

function positionClasses(position: OnScreenText['position']) {
  if (position === 'Top') return 'items-start pt-[9%]'
  if (position === 'Bottom') return 'items-end pb-[9%]'
  return 'items-center'
}

// Smoothstep — same progress value scrubbing gives, just eased so playback
// doesn't feel like a linear robotic pan.
function ease(t: number) {
  return t * t * (3 - 2 * t)
}

// Percentages of the shot layer's own size — framer-motion treats bare numbers
// as pixels, which is imperceptible on a ~300px preview, so every offset here
// is a percentage string instead.
const PAN_RANGE = 10
const TILT_RANGE = 8
const TRUCK_RANGE = 6
const CRANE_RANGE = 6

/** Maps a scene's camera movement + how far the playhead is through the scene
 * into a scale/translate for the shot layer. Everything here is a pure function
 * of progress so it tracks a manual scrub exactly, not just real-time playback —
 * Handheld/Steadicam are the exception, driven by continuous time instead (see
 * the motion.div below), since "how far into the scene" doesn't apply to a
 * jitter or a drift.
 *
 * Terminology and the physical distinction each movement is standing in for
 * follows https://www.pftrack.com/post/types-of-camera-movement-explained:
 * Pan/Tilt rotate the camera in place (simulated here as a wide, constant-
 * velocity sweep — a rotation has no "easing in", it just sweeps), while
 * Push/Pull/Truck/Crane physically translate the camera through space
 * (simulated with an eased scale/translate, since a moving camera has
 * momentum and settles in and out of the move).
 */
function shotTransform(movement: CameraMovement, progress: number): { scale: number; x: string; y: string } {
  const linear = Math.min(1, Math.max(0, progress))
  const eased = ease(linear)
  switch (movement) {
    case 'Push In':
      return { scale: 1 + eased * 0.14, x: '0%', y: '0%' }
    case 'Pull Out':
      return { scale: 1.14 - eased * 0.14, x: '0%', y: '0%' }
    case 'Pan':
      return { scale: 1.1, x: `${(linear - 0.5) * PAN_RANGE}%`, y: '0%' }
    case 'Tilt':
      return { scale: 1.1, x: '0%', y: `${(linear - 0.5) * TILT_RANGE}%` }
    case 'Truck':
      return { scale: 1.08, x: `${(eased - 0.5) * TRUCK_RANGE}%`, y: '0%' }
    case 'Crane':
      return { scale: 1.08, x: '0%', y: `${(eased - 0.5) * CRANE_RANGE}%` }
    case 'Handheld':
    case 'Steadicam':
    case 'Static':
    default:
      return { scale: 1, x: '0%', y: '0%' }
  }
}

/** A live "what will this actually look like" monitor — shows the storyboard
 * frame for whichever scene the playhead is currently over, with the on-screen
 * text rendered in its real position/animation and the camera movement
 * (pan/tilt/push/pull/truck/crane/handheld/steadicam) applied to the shot,
 * synced to the transport. */
export function PreviewPlayer({ episode, playhead, playing }: { episode: Episode; playhead: number; playing: boolean }) {
  const scene = findActiveScene(episode, playhead)
  if (!scene) return null

  const ratio = ASPECT_RATIO[episode.format]
  const color = PURPOSE_COLOR[scene.purpose] ?? '#d3a75c'
  const sceneDuration = Math.max(0.001, scene.end - scene.start)
  const elapsedIntoScene = playhead - scene.start
  const text = scene.onScreenText.text.trim()
  const showText = text.length > 0 && elapsedIntoScene < scene.onScreenText.duration
  const variant = TEXT_VARIANTS[scene.onScreenText.animation] ?? TEXT_VARIANTS['Fade In']

  const movement = scene.camera.movement
  const progress = elapsedIntoScene / sceneDuration
  const shot = shotTransform(movement, progress)
  // Handheld is unstabilized (high-frequency, jittery); Steadicam/gimbal is
  // stabilized (slow, smooth drift) — the article's key distinction between
  // the two "free-moving" camera categories. Both loop continuously via
  // framer-motion. Every other movement is a pure function of scrub position,
  // so it's applied as a plain inline transform instead of going through
  // framer-motion's animate reconciliation — that keeps it exact and
  // instantaneous, with no risk of a stale/mid-transition value lingering
  // after a scrub (which is what a duration:0 animate target was prone to).
  const isHandheld = movement === 'Handheld'
  const isSteadicam = movement === 'Steadicam'
  const isContinuousMotion = (isHandheld || isSteadicam) && playing

  const shotContent = scene.image ? (
    <img src={scene.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
  ) : (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#1c1a17] to-[#0c0b0a]">
      <Icon name={scene.thumbnailIcon} size={26} style={{ color }} />
      <span className="px-6 text-center text-[11px] text-white/35">No storyboard image yet</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl border border-border bg-black shadow-lg"
        style={{ aspectRatio: ratio }}
      >
        {isContinuousMotion ? (
          <motion.div
            className="absolute inset-0"
            animate={
              isHandheld
                ? {
                    x: ['0%', '2.5%', '-1.8%', '1.6%', '-2.2%', '0%'],
                    y: ['0%', '-2%', '1.8%', '-1%', '1.2%', '0%'],
                    rotate: [0, 0.6, -0.5, 0.4, -0.35, 0],
                    scale: 1.05,
                  }
                : {
                    x: ['0%', '1.2%', '-0.8%', '0.9%', '0%'],
                    y: ['0%', '-0.9%', '1.1%', '-0.4%', '0%'],
                    rotate: 0,
                    scale: [1.02, 1.035, 1.02, 1.03, 1.02],
                  }
            }
            transition={isHandheld ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: 'center' }}
          >
            {shotContent}
          </motion.div>
        ) : (
          <div
            className="absolute inset-0"
            style={{ transformOrigin: 'center', transform: `translate(${shot.x}, ${shot.y}) scale(${shot.scale})` }}
          >
            {shotContent}
          </div>
        )}

        <div className={`pointer-events-none absolute inset-0 flex justify-center px-[7%] text-center ${positionClasses(scene.onScreenText.position)}`}>
          <AnimatePresence mode="wait">
            {showText && (
              <motion.div
                key={scene.id + scene.onScreenText.text}
                initial={variant.initial}
                animate={variant.animate}
                exit={variant.exit}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="text-[20px] leading-tight font-semibold whitespace-pre-line text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]"
                style={{ fontFamily: scene.onScreenText.font }}
              >
                {text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[9.5px] font-medium backdrop-blur-sm"
          style={{ backgroundColor: `${color}30`, color }}
        >
          {scene.purpose}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10.5px] text-ink-faint">
        <span>Scene {scene.index}</span>
        <span>
          {scene.camera.shotType} · {scene.camera.movement}
        </span>
      </div>
    </div>
  )
}
