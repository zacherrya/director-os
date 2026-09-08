import { useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { NewOpportunityModal } from '../components/partnerships/NewOpportunityModal'
import { OpportunityPanel } from '../components/partnerships/OpportunityPanel'
import { OpportunityWorkspace } from '../components/partnerships/OpportunityWorkspace'
import { MediaKit } from './MediaKit'
import { Plus } from '../components/Icon'

type Tab = 'pipeline' | 'media-kit'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pipeline', label: 'Opportunities' },
  { id: 'media-kit', label: 'Media Kit' },
]

export function Partnerships() {
  const opportunities = useAppStore((s) => s.opportunities)
  const [tab, setTab] = useState<Tab>('pipeline')
  const [creating, setCreating] = useState(false)
  const [newBrandId, setNewBrandId] = useState<string | undefined>()
  // The open panel lives in the URL so that leaving for the Contact Nucleus and
  // coming back lands on the same pitch rather than on a bare board.
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  const setOpenId = (id: string | null) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('open', id)
        else next.delete('open')
        return next
      },
      { replace: true },
    )
  }

  const live = useMemo(() => opportunities.filter((o) => !o.deletedAt), [opportunities])
  const open = openId ? live.find((o) => o.id === openId) : undefined

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 px-10 pt-10">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-[26px] tracking-tight text-ink">Partnerships</h1>
              <p className="mt-0.5 max-w-[560px] text-[13px] leading-relaxed text-ink-dim">
                Turning the work into a business — who you are talking to, what you have offered them, and
                what happens next.
              </p>
            </div>
            {tab !== 'media-kit' && (
              <button
                onClick={() => { setNewBrandId(undefined); setCreating(true) }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2.5 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright"
              >
                <Plus size={15} strokeWidth={2} />
                Add Opportunity
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 border-b border-border-soft">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition ${
                  tab === t.id
                    ? 'border-gold text-ink'
                    : 'border-transparent text-ink-dim hover:text-ink'
                }`}
              >
                {t.label}
                {t.id === 'pipeline' && live.length > 0 && (
                  <span className="ml-1.5 text-[11px] text-ink-faint">{live.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {tab === 'pipeline' && (
          <div className="min-h-0 flex-1 overflow-hidden">
            <OpportunityWorkspace
              onOpen={(id) => setOpenId(id || null)}
              onAdd={(brandId) => { setNewBrandId(brandId); setCreating(true) }}
              selectedId={openId}
            />
          </div>
        )}

        {tab === 'media-kit' && (
          <div className="min-h-0 flex-1 overflow-hidden">
            <MediaKit embedded />
          </div>
        )}
      </div>

      <AnimatePresence>
        {open && <OpportunityPanel key={open.id} opportunity={open} onClose={() => setOpenId(null)} />}
      </AnimatePresence>

      {creating && (
        <NewOpportunityModal initialBrandId={newBrandId} onClose={() => setCreating(false)} onCreated={(id) => setOpenId(id)} />
      )}
    </div>
  )
}
