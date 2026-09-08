import { useEffect, useMemo, useRef, useState } from 'react'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { hexToRgb, hsvToRgb, normalizeHex, rgbToHex, rgbToHsv } from '../../lib/brandColor'

/**
 * A brand's own colour, picked the way an editor expects: a saturation/value
 * field, a hue strip, and a hex box that accepts a code pasted from a brand
 * guideline. The three stay in sync — drag the field and the hex updates, type
 * a hex and the handles move.
 *
 * The colour is identity, not state. It marks the face of the brand's pin in
 * the world and its monogram in the table, while the ring around the pin stays
 * health-coloured — so colouring a brand can never quietly hide the fact that
 * its deal has stalled.
 */

const PRESETS = [
  '#C8A86B', '#B99A5C', '#8F6D33', '#B6746B',
  '#A05F57', '#789681', '#5F7D69', '#4F8FC0',
  '#3F6D8E', '#8A7BD8', '#B6598F', '#2A2A2D',
]

/* ------------------------------------------------------------------- panel --- */

function useDrag(onMove: (x: number, y: number, rect: DOMRect) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const rect = el.getBoundingClientRect()
    const run = (cx: number, cy: number) => onMove(cx, cy, rect)
    run(e.clientX, e.clientY)
    const move = (ev: PointerEvent) => run(ev.clientX, ev.clientY)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return { ref, onPointerDown: handle }
}

export function BrandColorPicker({
  value,
  onChange,
  onClose,
}: {
  value?: string
  onChange: (hex: string | undefined) => void
  onClose: () => void
}) {
  useEscapeKey(onClose)

  const initial = value && normalizeHex(value) ? normalizeHex(value)! : '#C8A86B'
  const [hsv, setHsv] = useState<[number, number, number]>(() => {
    const [r, g, b] = hexToRgb(initial)
    return rgbToHsv(r, g, b)
  })
  const [hexDraft, setHexDraft] = useState(initial)

  const hex = useMemo(() => {
    const [r, g, b] = hsvToRgb(hsv[0], hsv[1], hsv[2])
    return rgbToHex(r, g, b)
  }, [hsv])

  // The field is authoritative while it holds a valid code; otherwise it follows
  // the handles, so dragging never fights what is being typed.
  useEffect(() => {
    setHexDraft(hex)
  }, [hex])

  const commit = (next: string) => {
    const norm = normalizeHex(next)
    if (!norm) return
    const [r, g, b] = hexToRgb(norm)
    setHsv(rgbToHsv(r, g, b))
    onChange(norm)
  }

  const field = useDrag((x, y, rect) => {
    const s = Math.min(1, Math.max(0, (x - rect.left) / rect.width))
    const v = 1 - Math.min(1, Math.max(0, (y - rect.top) / rect.height))
    setHsv(([h]) => {
      const [r, g, b] = hsvToRgb(h, s, v)
      onChange(rgbToHex(r, g, b))
      return [h, s, v]
    })
  })

  const hueBar = useDrag((x, _y, rect) => {
    const h = Math.min(360, Math.max(0, ((x - rect.left) / rect.width) * 360))
    setHsv(([, s, v]) => {
      const [r, g, b] = hsvToRgb(h, s, v)
      onChange(rgbToHex(r, g, b))
      return [h, s, v]
    })
  })

  const pureHue = rgbToHex(...hsvToRgb(hsv[0], 1, 1))

  return (
    <div className="w-[248px] rounded-xl border border-[#E5E5E7] bg-white p-3 shadow-2xl">
      <div
        {...field}
        role="application"
        aria-label="Saturation and brightness"
        className="relative h-[128px] w-full cursor-crosshair rounded-lg"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${pureHue}`,
        }}
      >
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, backgroundColor: hex }}
        />
      </div>

      <div
        {...hueBar}
        role="application"
        aria-label="Hue"
        className="relative mt-2.5 h-3 w-full cursor-ew-resize rounded-full"
        style={{
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${(hsv[0] / 360) * 100}%`, backgroundColor: pureHue }}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          className="h-8 w-8 shrink-0 rounded-md border border-[#E5E5E7]"
          style={{ backgroundColor: hex }}
        />
        <input
          value={hexDraft}
          onChange={(e) => {
            setHexDraft(e.target.value)
            commit(e.target.value)
          }}
          onBlur={() => setHexDraft(hex)}
          spellCheck={false}
          aria-label="Hex colour"
          className="w-full rounded-md border border-[#E5E5E7] bg-[#FCFBF8] px-2 py-1.5 font-mono text-[12px] tracking-wide text-[#1C1C1E] uppercase outline-none focus:border-[#C8A86B]"
        />
      </div>

      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => commit(p)}
            title={p}
            aria-label={p}
            className="h-6 w-full rounded-md border transition hover:scale-110"
            style={{ backgroundColor: p, borderColor: hex === p ? '#1C1C1E' : '#E5E5E7' }}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#EDEDEF] pt-2.5">
        <button
          onClick={() => {
            onChange(undefined)
            onClose()
          }}
          className="rounded-md bg-transparent px-1.5 py-1 text-[11.5px] text-[#8d908b] hover:text-[#1C1C1E]"
        >
          No colour
        </button>
        <button
          onClick={onClose}
          className="rounded-md bg-[#1C1C1E] px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-[#33333a]"
        >
          Done
        </button>
      </div>
    </div>
  )
}
