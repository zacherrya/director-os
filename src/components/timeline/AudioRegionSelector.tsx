import { useEffect, useRef, useState } from 'react'

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Lets a creator pick which slice of an uploaded audio file plays under a
 * scene, sized to that scene's duration — e.g. "start the song at 0:42" for
 * a 6-second scene, rather than always starting from the top of the track.
 */
export function AudioRegionSelector({
  fileUrl,
  sceneDuration,
  trimStart,
  onChange,
}: {
  fileUrl: string
  sceneDuration: number
  trimStart: number
  onChange: (v: number) => void
}) {
  const [sourceDuration, setSourceDuration] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    setSourceDuration(null)
    const audio = new Audio(fileUrl)
    function handleLoaded() {
      setSourceDuration(audio.duration)
    }
    audio.addEventListener('loadedmetadata', handleLoaded)
    return () => audio.removeEventListener('loadedmetadata', handleLoaded)
  }, [fileUrl])

  const maxStart = sourceDuration !== null ? Math.max(0, sourceDuration - sceneDuration) : 0

  function seekFromClientX(clientX: number) {
    const track = trackRef.current
    if (!track || sourceDuration === null) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const center = ratio * sourceDuration
    const newStart = Math.min(maxStart, Math.max(0, center - sceneDuration / 2))
    onChange(Math.round(newStart * 10) / 10)
  }

  function handlePointerDown(e: React.PointerEvent) {
    setDragging(true)
    seekFromClientX(e.clientX)
  }

  useEffect(() => {
    if (!dragging) return
    function handleMove(e: PointerEvent) {
      seekFromClientX(e.clientX)
    }
    function handleUp() {
      setDragging(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, sourceDuration, sceneDuration])

  if (sourceDuration === null) {
    return <div className="text-[11px] text-ink-faint italic">Reading track length…</div>
  }

  if (sourceDuration <= sceneDuration) {
    return (
      <div className="text-[11px] text-ink-faint">
        Track is {formatDuration(sourceDuration)}, shorter than this scene ({formatDuration(sceneDuration)}) — the
        whole thing plays.
      </div>
    )
  }

  const clampedStart = Math.min(Math.max(0, trimStart), maxStart)
  const windowWidthPct = (sceneDuration / sourceDuration) * 100
  const windowLeftPct = (clampedStart / sourceDuration) * 100

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-medium text-ink-dim">
        <span>Which part plays</span>
        <span className="text-ink-faint">
          {formatDuration(clampedStart)}–{formatDuration(clampedStart + sceneDuration)} of {formatDuration(sourceDuration)}
        </span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        className="relative h-9 w-full cursor-pointer touch-none rounded-md bg-surface-2 select-none"
      >
        <div
          className="absolute top-0 h-full cursor-grab rounded-md border-2 border-gold bg-gold-soft transition-[left,width] active:cursor-grabbing"
          style={{
            left: `${windowLeftPct}%`,
            width: `${windowWidthPct}%`,
            transitionDuration: dragging ? '0ms' : '120ms',
          }}
        />
      </div>
    </div>
  )
}
