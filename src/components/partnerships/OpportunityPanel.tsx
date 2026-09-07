import { OpportunityJourney } from './OpportunityJourney'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import {
  stageChange,
  actionState,
  formatActionDate,
  STAGE_COLOR,
  STAGES,
  TYPE_INFO,
  VALUE_OFFERED,
  type Opportunity,
} from '../../lib/partnerships'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { Icon, Trash2, X } from '../Icon'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">
      {children}
    </span>
  )
}

const inputClass =
  'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-gold'

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o)
        return (
          <button
            key={o}
            onClick={() => onToggle(o)}
            aria-pressed={on}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] transition ${
              on
                ? 'border-gold bg-gold-soft font-medium text-gold'
                : 'border-border text-ink-dim hover:border-ink-faint hover:text-ink'
            }`}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

export function OpportunityPanel({
  opportunity,
  onClose,
}: {
  opportunity: Opportunity
  onClose: () => void
}) {
  useEscapeKey(onClose)

  const brands = useAppStore((s) => s.brands)
  const updateOpportunity = useAppStore((s) => s.updateOpportunity)
  const deleteOpportunity = useAppStore((s) => s.deleteOpportunity)
  const updateBrand = useAppStore((s) => s.updateBrand)

  const brand = useMemo(() => brands.find((b) => b.id === opportunity.brandId), [brands, opportunity.brandId])
  const info = TYPE_INFO[opportunity.type]
  const state = actionState(opportunity)

  const patch = (p: Partial<Opportunity>) => updateOpportunity(opportunity.id, p)
  const toggle = (key: 'formats' | 'valueOffered', value: string) => {
    const cur = opportunity[key]
    patch({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] })
  }

  return (
    <motion.aside
      initial={{ x: 460, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 460, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Brand details"
      className="absolute right-0 top-0 z-30 flex h-full w-[460px] max-w-full shadow-2xl shrink-0 flex-col overflow-hidden border-l border-border bg-surface"
    >
      <div className="flex items-start justify-between border-b border-border-soft px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">
            <Icon name={info.icon} size={12} />
            {info.label}
          </div>
          <h2 className="mt-0.5 truncate font-display text-[18px] text-ink">{brand?.name ?? 'Unknown brand'}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-2 text-ink-faint transition hover:bg-surface-2 hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-5">
          <Label>Stage</Label>
          <select
            value={opportunity.stage}
            onChange={(e) => patch(stageChange(opportunity, e.target.value as Opportunity['stage']))}
            className={`${inputClass} cursor-pointer`}
            style={{ color: STAGE_COLOR[opportunity.stage] }}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div
          className={`mb-6 rounded-xl border p-3.5 ${
            state === 'overdue' || state === 'none' ? 'border-gold/40 bg-gold-soft' : 'border-border bg-surface-2'
          }`}
        >
          <Label>Next action</Label>
          <input
            value={opportunity.nextAction}
            onChange={(e) => patch({ nextAction: e.target.value })}
            placeholder="Follow up with Priya"
            className={`${inputClass} bg-surface`}
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              type="date"
              value={opportunity.nextActionDate}
              onChange={(e) => patch({ nextActionDate: e.target.value })}
              className={`${inputClass} bg-surface w-auto`}
            />
            {opportunity.nextActionDate && (
              <span className="text-[11.5px] text-ink-dim">{formatActionDate(opportunity.nextActionDate)}</span>
            )}
          </div>
          {state === 'none' && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-dim">
              Nothing scheduled. Deals die of silence more often than rejection — give it a date.
            </p>
          )}
        </div>

        <OpportunityJourney opportunity={opportunity} brand={brand} />

        <div className="mb-4">
          <Label>The idea</Label>
          <input
            value={opportunity.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="One Lipstick, Three Outfits"
            className={inputClass}
          />
        </div>

        <div className="mb-4">
          <Label>What happens in it</Label>
          <textarea
            value={opportunity.concept}
            onChange={(e) => patch({ concept: e.target.value })}
            rows={3}
            placeholder="Three completely different looks built around one shade."
            className={`${inputClass} resize-none leading-relaxed`}
          />
        </div>

        <div className="mb-4">
          <Label>Why this brand fits</Label>
          <textarea
            value={opportunity.fit}
            onChange={(e) => patch({ fit: e.target.value })}
            rows={2}
            placeholder="Beauty and styling, same audience."
            className={`${inputClass} resize-none leading-relaxed`}
          />
        </div>

        <div className="mb-6">
          <Label>Why the audience would care</Label>
          <textarea
            value={opportunity.audienceWhy}
            onChange={(e) => patch({ audienceWhy: e.target.value })}
            rows={2}
            placeholder="Practical styling rather than another product review."
            className={`${inputClass} resize-none leading-relaxed`}
          />
        </div>

        {info.formats.length > 0 && (
          <div className="mb-5">
            <Label>{info.formatsLabel}</Label>
            <Chips
              options={info.formats}
              selected={opportunity.formats}
              onToggle={(v) => toggle('formats', v)}
            />
          </div>
        )}

        {opportunity.type === 'paid' && (
          <div className="mb-5">
            <Label>What value are you offering?</Label>
            <Chips
              options={VALUE_OFFERED}
              selected={opportunity.valueOffered}
              onToggle={(v) => toggle('valueOffered', v)}
            />
          </div>
        )}

        {opportunity.type !== 'pr' && (
          <div className="mb-5">
            <Label>Fee</Label>
            <input
              value={opportunity.fee}
              onChange={(e) => patch({ fee: e.target.value })}
              placeholder="₹25,000"
              className={inputClass}
            />
          </div>
        )}

        {brand && (
          <div className="mb-5 rounded-xl border border-border bg-surface-2 p-3.5">
            <Label>Contact at {brand.name}</Label>
            <input
              value={brand.contactName}
              onChange={(e) => updateBrand(brand.id, { contactName: e.target.value })}
              placeholder="Name"
              className={`${inputClass} bg-surface mb-2`}
            />
            <input
              value={brand.contactEmail}
              onChange={(e) => updateBrand(brand.id, { contactEmail: e.target.value })}
              placeholder="email@brand.com"
              className={`${inputClass} bg-surface`}
            />
          </div>
        )}

        <button
          onClick={() => {
            deleteOpportunity(opportunity.id)
            onClose()
          }}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-ink-faint transition hover:bg-red-400/10 hover:text-red-400"
        >
          <Trash2 size={13} />
          Delete this opportunity
        </button>
      </div>
    </motion.aside>
  )
}
