import { PURPOSE_COLOR } from '../../lib/types'
import type { PatternBeat } from '../../lib/types'

/** The visual signature of a pattern — beats laid out left-to-right, each
 * one's width proportional to its weight, colored by the same purpose
 * palette used everywhere else in the app (timeline scene blocks, pacing
 * strip). Small on a card, larger with labels in the preview panel. */
export function PatternTimelineStrip({
  beats,
  height = 34,
  showLabels = false,
}: {
  beats: PatternBeat[]
  height?: number
  showLabels?: boolean
}) {
  return (
    <div className="flex gap-[3px]" style={{ height }}>
      {beats.map((beat) => {
        const color = PURPOSE_COLOR[beat.purpose] ?? '#d3a75c'
        return (
          <div
            key={beat.id}
            className="group/beat relative flex min-w-[6px] flex-col justify-end overflow-hidden rounded-[6px]"
            style={{ flexGrow: beat.weight, flexBasis: 0, backgroundColor: `${color}26` }}
            title={`${beat.purpose}${beat.note ? ` — ${beat.note}` : ''}`}
          >
            <div className="h-[3px] w-full" style={{ backgroundColor: color }} />
            {showLabels && (
              <span
                className="truncate px-1.5 py-1 text-[9.5px] font-medium"
                style={{ color }}
              >
                {beat.purpose}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
