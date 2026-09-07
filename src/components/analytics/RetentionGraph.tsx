import { useMemo, useRef, useState } from 'react'
import {
  HOOK_WINDOW_S,
  SATISFIED_ZONE,
  type RetentionReport,
} from '../../lib/retentionAnalysis'

const W = 700
const H = 220
const PAD_TOP = 18
const PAD_BOTTOM = 26
const PLOT_H = H - PAD_TOP - PAD_BOTTOM

const GOOD = '#6bb15a'
const BAD = '#c96a4a'

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * The curve, with the three zones that actually get judged shaded behind it.
 *
 * The y axis is allowed past 100% deliberately: a rewatched segment genuinely
 * exceeds the starting audience, and flattening that to 100% would hide the one
 * marker on the whole graph that says "this bit worked".
 */
export function RetentionGraph({ report }: { report: RetentionReport }) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const { points, durationSeconds } = report
  const yMax = useMemo(() => Math.max(1.05, ...points.map((p) => p.watching)), [points])

  const x = (position: number) => position * W
  const y = (watching: number) => PAD_TOP + PLOT_H - (watching / yMax) * PLOT_H

  const path = useMemo(() => {
    if (points.length === 0) return ''
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.position).toFixed(1)},${y(p.watching).toFixed(1)}`).join(' ')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, yMax])

  const area = useMemo(() => {
    if (points.length === 0) return ''
    const base = PAD_TOP + PLOT_H
    return `${path} L${W},${base} L0,${base} Z`
  }, [path, points])

  const hookEnd = durationSeconds && durationSeconds > 0
    ? Math.min(1, Math.min(HOOK_WINDOW_S, Math.max(3, durationSeconds * 0.25)) / durationSeconds)
    : 0.05

  const cliffs = report.findings.filter((f) => f.kind === 'cliff' && f.position !== null)
  const spikes = report.findings.filter((f) => f.kind === 'spike' && f.position !== null)

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    setHover(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
  }

  const hovered = useMemo(() => {
    if (hover === null || points.length === 0) return null
    let best = points[0]
    for (const p of points) if (Math.abs(p.position - hover) < Math.abs(best.position - hover)) best = p
    return best
  }, [hover, points])

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 text-center text-[12.5px] text-ink-faint">
        No retention curve for this video yet.
      </div>
    )
  }

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        style={{ height: 'auto' }}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="retentionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--dos-gold)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--dos-gold)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Zones: the hook window, and the stretch where leaving means satisfied. */}
        <rect x={0} y={PAD_TOP} width={x(hookEnd)} height={PLOT_H} fill="var(--dos-ink-faint)" opacity={0.07} />
        <rect
          x={x(SATISFIED_ZONE)}
          y={PAD_TOP}
          width={W - x(SATISFIED_ZONE)}
          height={PLOT_H}
          fill={GOOD}
          opacity={0.06}
        />

        {/* Horizontal guides at 100 / 50 / 0. */}
        {[1, 0.5, 0].map((v) => (
          <g key={v}>
            <line
              x1={0}
              x2={W}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--dos-border)"
              strokeWidth={1}
              strokeDasharray={v === 1 ? undefined : '3 4'}
            />
            <text x={4} y={y(v) - 4} fontSize={9} fill="var(--dos-ink-faint)">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}

        {/* Scene boundaries from the linked episode. */}
        {report.sceneMarks.map((m) => (
          <line
            key={m.scene.id}
            x1={x(m.position)}
            x2={x(m.position)}
            y1={PAD_TOP}
            y2={PAD_TOP + PLOT_H}
            stroke="var(--dos-border)"
            strokeWidth={1}
            opacity={0.7}
          />
        ))}

        <path d={area} fill="url(#retentionFill)" />
        <path d={path} fill="none" stroke="var(--dos-gold)" strokeWidth={2} strokeLinejoin="round" />

        {cliffs.map((f, i) => (
          <g key={`cliff-${i}`}>
            <line x1={x(f.position!)} x2={x(f.position!)} y1={PAD_TOP} y2={PAD_TOP + PLOT_H} stroke={BAD} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} />
            <circle cx={x(f.position!)} cy={y(report.points.find((p) => p.position >= f.position!)?.watching ?? 0)} r={3.5} fill={BAD} />
          </g>
        ))}

        {spikes.map((f, i) => (
          <circle
            key={`spike-${i}`}
            cx={x(f.position!)}
            cy={y(report.points.find((p) => p.position >= f.position!)?.watching ?? 0)}
            r={4}
            fill={GOOD}
            stroke="var(--dos-surface)"
            strokeWidth={1.5}
          />
        ))}

        {hovered && (
          <g>
            <line x1={x(hovered.position)} x2={x(hovered.position)} y1={PAD_TOP} y2={PAD_TOP + PLOT_H} stroke="var(--dos-ink-faint)" strokeWidth={1} />
            <circle cx={x(hovered.position)} cy={y(hovered.watching)} r={3.5} fill="var(--dos-gold)" />
          </g>
        )}

        {/* Time axis. */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text key={t} x={x(t)} y={H - 8} fontSize={9} fill="var(--dos-ink-faint)" textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}>
            {durationSeconds ? formatTime(t * durationSeconds) : `${Math.round(t * 100)}%`}
          </text>
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--dos-gold)' }} />
          Still watching
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: BAD }} />
          Drop-off
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: GOOD }} />
          Rewatched
        </span>
        <span>Shaded left: the hook window. Shaded right: leaving here reads as satisfied.</span>
        {hovered && (
          <span className="ml-auto font-medium text-ink tabular-nums">
            {durationSeconds ? formatTime(hovered.position * durationSeconds) : `${Math.round(hovered.position * 100)}%`}
            {' · '}
            {Math.round(hovered.watching * 100)}% watching
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * A thumbnail of the curve, for picking which video to look at.
 *
 * The shape is the whole point of the selector — a cliff, a slow bleed and a
 * clean slope are instantly distinguishable at this size even though none of the
 * numbers are readable, so you can choose by looking rather than by guessing.
 */
export function RetentionSparkline({ report }: { report: RetentionReport }) {
  const w = 160
  const h = 30
  const { points } = report
  const yMax = Math.max(1.05, ...points.map((p) => p.watching))

  const px = (position: number) => position * w
  const py = (watching: number) => h - (watching / yMax) * h

  if (points.length === 0) return null

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.position).toFixed(1)},${py(p.watching).toFixed(1)}`).join(' ')
  const cliffs = report.findings.filter((f) => f.kind === 'cliff' && f.position !== null)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-1.5 w-full" style={{ height: 'auto' }} aria-hidden>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="var(--dos-gold)" opacity={0.14} />
      <path d={line} fill="none" stroke="var(--dos-gold)" strokeWidth={1.5} strokeLinejoin="round" />
      {cliffs.map((f, i) => (
        <line
          key={i}
          x1={px(f.position!)}
          x2={px(f.position!)}
          y1={0}
          y2={h}
          stroke={BAD}
          strokeWidth={1}
          opacity={0.75}
        />
      ))}
    </svg>
  )
}
