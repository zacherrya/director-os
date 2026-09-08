import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { buildPitch, formulaRows, pitchProof, pitchReady, type FormulaRow } from '../../lib/pitch'
import { toast } from '../../lib/toast'
import type { Brand, Opportunity } from '../../lib/partnerships'
import { Check, Copy } from '../Icon'

/**
 * The strategy is on screen before the button is. Each part of the formula shows
 * whether it is actually covered and what it is for, so a thin pitch is visibly
 * thin rather than quietly generated.
 */

const OK = '#5f7d69'
const GAP = '#a05f57'
const MUTED = '#8d908b'

function Row({ row }: { row: FormulaRow }) {
  const tone = row.notApplicable ? MUTED : row.met ? OK : GAP
  return (
    <div className="flex gap-2.5 border-t border-[#F2F2F4] py-2.5 first:border-t-0 first:pt-0">
      <span
        className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: tone }}
        aria-hidden
      />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-[1.3px]"
            style={{ color: row.notApplicable ? MUTED : '#1C1C1E' }}
          >
            {row.step}
          </span>
          <span className="text-[10.5px] text-[#9a9d97]">{row.purpose}</span>
        </div>
        <p
          className="mt-1 text-[11.5px] leading-relaxed"
          style={{ color: row.met && !row.notApplicable ? '#4a4d49' : MUTED }}
        >
          {row.detail}
        </p>
      </div>
    </div>
  )
}

export function PitchBuilder({ opportunity, brand }: { opportunity: Opportunity; brand?: Brand }) {
  const mediaKit = useAppStore((s) => s.mediaKit)
  const socialPosts = useAppStore((s) => s.socialPosts)
  const [pitch, setPitch] = useState<string | null>(null)

  const proof = useMemo(() => pitchProof(socialPosts), [socialPosts])
  const rows = useMemo(() => formulaRows(opportunity, proof), [opportunity, proof])
  const ready = pitchReady(rows)
  const missing = rows.filter((r) => ['Personal', 'Relevance', 'Idea'].includes(r.step) && !r.met)

  function generate() {
    setPitch(buildPitch(opportunity, brand, mediaKit, proof))
  }

  async function copy() {
    if (!pitch) return
    try {
      await navigator.clipboard.writeText(pitch)
      toast.success('Pitch copied.')
    } catch {
      toast.error('Could not reach the clipboard. Select the text and copy it manually.')
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-[#EDEDEF] bg-[#FCFCFB] p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[1.3px] text-[#8e9189]">Pitch</span>
        <span className="text-[10.5px] text-[#9a9d97]">Personal · Relevance · Idea · Proof · Ask</span>
      </div>

      <div className="mt-3">
        {rows.map((r) => (
          <Row key={r.step} row={r} />
        ))}
      </div>

      {!pitch ? (
        <>
          <button
            onClick={generate}
            disabled={!ready}
            className="mt-3 w-full rounded-lg bg-[#1C1C1E] px-3 py-2 text-[12px] font-medium text-white transition hover:bg-[#33333a] disabled:cursor-not-allowed disabled:bg-[#DCDCDE] disabled:text-[#8d908b]"
          >
            Generate pitch
          </button>
          {!ready && (
            <p className="mt-2 text-[11px] leading-relaxed text-[#8d908b]">
              Fill in {missing.map((m) => m.step.toLowerCase()).join(', ')} first. A pitch without them is the
              one brands delete.
            </p>
          )}
        </>
      ) : (
        <div className="mt-3">
          <textarea
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            rows={16}
            spellCheck={false}
            aria-label="Generated pitch"
            className="w-full resize-none rounded-lg border border-[#E5E5E7] bg-white px-3 py-2.5 text-[12px] leading-relaxed text-[#1C1C1E] outline-none focus:border-[#C8A86B]"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={copy}
              className="flex items-center gap-1.5 rounded-lg bg-[#1C1C1E] px-3 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-[#33333a]"
            >
              <Copy size={12} />
              Copy
            </button>
            <button
              onClick={generate}
              className="rounded-lg border border-[#E5E5E7] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#6f7370] transition hover:text-[#1C1C1E]"
            >
              Rebuild from strategy
            </button>
          </div>

          {opportunity.type === 'pr' && (
            <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#8d908b]">
              <Check size={11} style={{ color: OK, marginTop: 2, flexShrink: 0 }} />
              This promises no content. Receiving product does not oblige you to post, and a pitch that hints
              otherwise sets the expectation anyway.
            </p>
          )}
          {opportunity.type === 'ugc' && (
            <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#8d908b]">
              <Check size={11} style={{ color: OK, marginTop: 2, flexShrink: 0 }} />
              No audience numbers, deliberately. They are buying footage for their own channels — your reach is
              not what is being sold.
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-[#9a9d97]">
            Director does not send this. Copy it into your own email or DM, then log it under Outreach routes.
          </p>
        </div>
      )}
    </div>
  )
}
