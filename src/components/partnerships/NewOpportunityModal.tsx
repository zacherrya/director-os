import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import { PARTNERSHIP_TYPES, TYPE_INFO, makeJourney, localDate, activityEntry, type PartnershipType } from '../../lib/partnerships'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { Icon, X } from '../Icon'

/**
 * The type is chosen before anything else, because it changes what the deal is.
 * The guidance on each card is the point of the screen — most of the money a
 * creator leaves behind is lost at exactly this decision, by agreeing to make a
 * Reel in exchange for a product, or by pricing UGC as though the audience were
 * being sold along with it.
 */
export function NewOpportunityModal({
  onClose,
  onCreated,
  initialBrandId,
}: {
  initialBrandId?: string
  onClose: () => void
  onCreated: (opportunityId: string) => void
}) {
  useEscapeKey(onClose)

  const brands = useAppStore((s) => s.brands)
  const createBrand = useAppStore((s) => s.createBrand)
  const createOpportunity = useAppStore((s) => s.createOpportunity)

  const [type, setType] = useState<PartnershipType | null>(null)
  const [contacted, setContacted] = useState(false)
  const [hasConcept, setHasConcept] = useState(false)
  const updateOpportunity = useAppStore(s => s.updateOpportunity)
  const [brandQuery, setBrandQuery] = useState('')
  const [brandId, setBrandId] = useState<string | null>(initialBrandId ?? null)

  const live = useMemo(() => brands.filter((b) => !b.deletedAt), [brands])
  const matches = useMemo(() => {
    const q = brandQuery.trim().toLowerCase()
    if (!q) return live.slice(0, 5)
    return live.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 5)
  }, [live, brandQuery])

  const chosen = brandId ? live.find((b) => b.id === brandId) : undefined
  const exactMatch = live.find((b) => b.name.toLowerCase() === brandQuery.trim().toLowerCase())
  const ready = type !== null && (chosen !== undefined || brandQuery.trim().length > 0)

  function handleCreate() {
    if (!type || !ready) return
    const brand = chosen ?? exactMatch ?? createBrand(brandQuery.trim())
    if (!brand) return
    const opportunity = createOpportunity(brand.id, type)
    const journey = makeJourney(contacted, hasConcept)
    updateOpportunity(opportunity.id, { journey, stage: journey[0].stage, nextAction: journey[0].label, nextActionDate: localDate(), priority: 'Normal', activity: [activityEntry(`Opportunity created. ${contacted ? 'Previously contacted' : 'Not contacted yet'}. ${hasConcept ? 'Concept exists' : 'Concept to develop'}.`)] })
    onClose()
    onCreated(opportunity.id)
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="New opportunity"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={type === null && !brandQuery ? onClose : undefined}
      >
        <motion.div
          className="flex max-h-[88vh] w-[min(720px,94vw)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between px-6 pt-6 pb-4">
            <div>
              <h2 className="font-display text-[19px] text-ink">What are you trying to get?</h2>
              <p className="mt-0.5 text-[12px] text-ink-dim">
                Pick your goal. We’ll turn it into a clear plan.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
            <div className="grid gap-3 sm:grid-cols-4">
              {PARTNERSHIP_TYPES.map((t) => {
                const info = TYPE_INFO[t]
                const active = type === t
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    aria-pressed={active}
                    className={`flex flex-col rounded-xl border p-4 text-left transition ${
                      active
                        ? 'border-gold bg-gold-soft'
                        : 'border-border bg-surface-2 hover:border-ink-faint'
                    }`}
                  >
                    <Icon name={info.icon} size={17} className={active ? 'text-gold' : 'text-ink-faint'} />
                    <span className="mt-2.5 text-[13px] font-medium text-ink">{info.label}</span>
                    <span className="mt-1.5 text-[11.5px] leading-relaxed text-ink-dim">{info.goal}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {([{label:'Have you contacted them?', value:contacted, set:setContacted}, {label:'Do you already have a concept?', value:hasConcept, set:setHasConcept}]).map(q => <fieldset key={q.label}><legend className="mb-2 text-[12px] text-ink-dim">{q.label}</legend><div className="flex gap-2">{[false,true].map(value => <button key={String(value)} type="button" aria-pressed={q.value === value} onClick={() => q.set(value)} className={`rounded-lg border px-4 py-2 text-[12px] ${q.value === value ? 'border-gold bg-gold-soft text-gold' : 'border-border text-ink-dim'}`}>{value ? 'Yes' : 'No'}</button>)}</div></fieldset>)}
            </div>
            {type && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                <p className="rounded-lg border border-border bg-surface-2 px-3.5 py-3 text-[12px] leading-relaxed text-ink-dim">
                  {TYPE_INFO[type].detail}
                </p>
                {TYPE_INFO[type].caution && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-gold/40 bg-gold-soft px-3.5 py-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    <p className="text-[12px] leading-relaxed text-ink">{TYPE_INFO[type].caution}</p>
                  </div>
                )}

                <div className="mt-5">
                  <label
                    htmlFor="opp-brand"
                    className="mb-1 block text-[10.5px] font-medium tracking-wide text-ink-faint uppercase"
                  >
                    Brand
                  </label>
                  <input
                    id="opp-brand"
                    autoFocus
                    value={chosen ? chosen.name : brandQuery}
                    onChange={(e) => {
                      setBrandQuery(e.target.value)
                      setBrandId(null)
                    }}
                    placeholder="Nykaa"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-gold"
                  />
                  {matches.length > 0 && !chosen && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {matches.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => {
                            setBrandId(b.id)
                            setBrandQuery(b.name)
                          }}
                          className="rounded-full border border-border px-2.5 py-1 text-[11.5px] text-ink-dim transition hover:border-gold hover:text-ink"
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {!chosen && !exactMatch && brandQuery.trim() && (
                    <p className="mt-2 text-[11.5px] text-ink-faint">
                      Creates “{brandQuery.trim()}” as a new brand.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border-soft px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-ink-dim hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!ready}
              className="rounded-lg bg-gold px-4 py-2 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create opportunity
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
