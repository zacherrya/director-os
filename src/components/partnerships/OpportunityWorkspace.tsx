import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import {
  DESTINATIONS,
  OPEN_STAGES,
  activityEntry,
  actionState,
  completeAction,
  destinationIndex,
  formatActionDate,
  localDate,
  outcomeOf,
  worldHealth,
  WORLD_HEALTH_COLOR,
  type Brand,
  type Opportunity,
} from '../../lib/partnerships'
import { Plus, Search } from '../Icon'
import { PartnershipWorld, type DragMode, type WorldBrand } from './PartnershipWorld'
import { PartnershipTable } from './PartnershipTable'
import { RelationshipLog } from './RelationshipLog'

type View = 'world' | 'table' | 'log'
const VIEWS: { id: View; label: string }[] = [
  { id: 'world', label: 'World' },
  { id: 'table', label: 'Table' },
  { id: 'log', label: 'Log' },
]

const SAVED_VIEWS = ['Everything', 'Needs action', 'Live deals', 'Won & producing', 'Archive'] as const
type SavedView = (typeof SAVED_VIEWS)[number]

function dueTone(o: Opportunity): string {
  const s = actionState(o)
  if (s === 'overdue') return '#a05f57'
  if (s === 'today') return '#8f6d33'
  return '#9a9d97'
}

export function OpportunityWorkspace({
  onOpen,
  onAdd,
  selectedId,
}: {
  onOpen: (id: string) => void
  onAdd: (brandId?: string) => void
  selectedId: string | null
}) {
  const brands = useAppStore((s) => s.brands)
  const opportunities = useAppStore((s) => s.opportunities)
  const update = useAppStore((s) => s.updateOpportunity)

  const [view, setView] = useState<View>('world')
  const [dragMode, setDragMode] = useState<DragMode>(() => {
    try {
      return localStorage.getItem('director-os-world-drag') === 'orbit' ? 'orbit' : 'pan'
    } catch {
      return 'pan'
    }
  })

  function chooseDragMode(mode: DragMode) {
    setDragMode(mode)
    try {
      localStorage.setItem('director-os-world-drag', mode)
    } catch {
      /* a private window just gets the default next time */
    }
  }
  const [query, setQuery] = useState('')
  const [savedView, setSavedView] = useState<SavedView>('Everything')
  const resetViewRef = useRef<() => void>(() => {})

  const live = useMemo(() => opportunities.filter((o) => !o.deletedAt), [opportunities])
  const brandsById = useMemo(
    () => new Map<string, Brand>(brands.filter((b) => !b.deletedAt).map((b) => [b.id, b])),
    [brands],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return live.filter((o) => {
      const brand = brandsById.get(o.brandId)
      if (q) {
        const hay = `${brand?.name ?? ''} ${o.title} ${o.nextAction} ${brand?.contactName ?? ''} ${brand?.contactEmail ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      switch (savedView) {
        case 'Needs action': {
          const h = worldHealth(o)
          return h !== 'Moving well' && h !== 'Waiting'
        }
        case 'Live deals':
          return ['Research', 'Concept', 'Ready to pitch', 'Pitched', 'Replied', 'Negotiating'].includes(o.stage)
        case 'Won & producing':
          return ['Agreed', 'In production', 'Delivered', 'Paid'].includes(o.stage)
        case 'Archive':
          return outcomeOf(o) === 'Declined' || o.stage === 'Relationship'
        default:
          return true
      }
    })
  }, [live, brandsById, query, savedView])

  const worldBrands: WorldBrand[] = useMemo(
    () =>
      filtered.map((o) => ({
        id: o.id,
        dest: destinationIndex(o),
        health: worldHealth(o),
        priority: o.priority ?? 'Normal',
        color: brandsById.get(o.brandId)?.color,
      })),
    [filtered, brandsById],
  )

  const inFlight = worldBrands.filter((b) => b.dest > 0 && b.dest < 9).length
  // One brand can have two live deals, so this counts opportunities — which is
  // what the world actually draws, one pin each.
  const worldSummary = live.length
    ? `${filtered.length} opportunit${filtered.length === 1 ? 'y' : 'ies'} across ${DESTINATIONS.length} destinations · ${inFlight} in flight`
    : `${DESTINATIONS.length} destinations · nothing here yet`

  const today = useMemo(() => {
    return live
      .filter((o) => OPEN_STAGES.includes(o.stage))
      .filter((o) => ['overdue', 'today'].includes(actionState(o)) || (!o.nextAction.trim() && o.stage !== 'Discovery'))
      .sort((a, b) => (a.nextActionDate || '9999').localeCompare(b.nextActionDate || '9999'))
      .slice(0, 12)
  }, [live])

  const complete = (o: Opportunity) => update(o.id, completeAction(o))
  const snooze = (o: Opportunity) =>
    update(o.id, {
      nextActionDate: localDate(1),
      activity: [...(o.activity ?? []), activityEntry('Snoozed next action until tomorrow')],
    })

  const viewTitle = view === 'world' ? 'Your partnership world' : view === 'table' ? 'Every opportunity' : 'Relationship log'

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-[#1C1C1E]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#EDEDEF] bg-[#FCFCFB] px-8 py-2.5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[9px] font-semibold tracking-[1.6px] text-[#8e9189]">TODAY</span>
          <span className="font-mono text-[10px] text-[#8f6d33]">{today.length}</span>
        </div>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5">
          {today.length === 0 && (
            <div className="flex items-center gap-2 text-[12px] text-[#8e9189]">
              {live.length
                ? 'All caught up — nothing needs you today.'
                : 'Your follow-ups will appear here.'}
            </div>
          )}
          {today.map((o) => {
            const brand = brandsById.get(o.brandId)
            const h = worldHealth(o)
            return (
              <div
                key={o.id}
                className="flex shrink-0 items-center gap-2.5 rounded-full border border-[#E9E9EB] bg-white py-1 pl-3 pr-1.5 hover:border-[#dcd2ba]"
              >
                <span
                  className="h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{ backgroundColor: WORLD_HEALTH_COLOR[h] }}
                />
                <span className="whitespace-nowrap text-[12px] font-medium text-[#1C1C1E]">
                  {brand?.name ?? 'Unknown brand'}
                </span>
                <span className="whitespace-nowrap text-[11.5px] text-[#6f7370]">
                  {o.nextAction || 'Set the next action'}
                </span>
                <span
                  className="whitespace-nowrap font-mono text-[10.5px]"
                  style={{ color: dueTone(o) }}
                >
                  {formatActionDate(o.nextActionDate) || 'No date'}
                </span>
                <span className="ml-0.5 flex items-center gap-0.5 border-l border-[#EDEDEF] pl-1.5">
                  <button
                    onClick={() => complete(o)}
                    title="Complete"
                    className="rounded-md bg-transparent px-1.5 py-1 text-[11px] text-[#8e9189] hover:bg-[#F2F5F1] hover:text-[#5f7d69]"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => snooze(o)}
                    title="Snooze"
                    className="rounded-md bg-transparent px-1.5 py-1 text-[10px] text-[#8e9189] hover:bg-[#F7F7F5] hover:text-[#1C1C1E]"
                  >
                    Snooze
                  </button>
                  <button
                    onClick={() => onOpen(o.id)}
                    title="Open brand"
                    className="rounded-md bg-transparent px-1.5 py-1 text-[11px] text-[#8e9189] hover:bg-[#F7F7F5] hover:text-[#1C1C1E]"
                  >
                    ↗
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3.5 px-8 pb-3 pt-3.5">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold tracking-[1.7px] text-[#8e9189]">
            FROM FIRST SIGNAL TO LASTING RELATIONSHIP
          </div>
          <h2 className="mt-1 font-display text-[19px] font-medium text-[#1C1C1E]">{viewTitle}</h2>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-1.5 rounded-md border border-[#E5E5E7] px-2.5 py-1.5 text-[#9a9d97]">
            <Search size={12} strokeWidth={2} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a brand…"
              className="w-[132px] border-0 bg-transparent text-[11.5px] text-[#1C1C1E] outline-none"
            />
          </label>
          <select
            value={savedView}
            onChange={(e) => setSavedView(e.target.value as SavedView)}
            className="cursor-pointer rounded-md border border-[#E5E5E7] bg-white px-2 py-1.5 text-[11.5px] text-[#4a4d48]"
          >
            {SAVED_VIEWS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          {view === 'world' && (
            <div
              className="flex gap-0.5 rounded-md border border-[#E8E8E2] bg-[#F3F3F0] p-[3px]"
              role="group"
              aria-label="What dragging does"
            >
              {([
                ['pan', 'Pan', 'Drag to walk across the world'],
                ['orbit', 'Orbit', 'Drag to swing around the centre'],
              ] as const).map(([mode, label, title]) => {
                const on = dragMode === mode
                return (
                  <button
                    key={mode}
                    onClick={() => chooseDragMode(mode)}
                    title={title}
                    aria-pressed={on}
                    className="rounded px-3 py-1.5 text-[11.5px]"
                    style={{
                      background: on ? '#ffffff' : 'transparent',
                      color: on ? '#1C1C1E' : '#81817a',
                      boxShadow: on ? '0 1px 4px rgba(0,0,0,.07)' : 'none',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex gap-0.5 rounded-md border border-[#E8E8E2] bg-[#F3F3F0] p-[3px]">
            {VIEWS.map((v) => {
              const on = view === v.id
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className="rounded px-3 py-1.5 text-[11.5px]"
                  style={{
                    background: on ? '#ffffff' : 'transparent',
                    color: on ? '#1C1C1E' : '#81817a',
                    boxShadow: on ? '0 1px 4px rgba(0,0,0,.07)' : 'none',
                  }}
                >
                  {v.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="relative mx-8 mb-6 min-h-[440px] flex-1 overflow-hidden rounded-2xl border border-[#E5E5E7] bg-[#F7F7F5]">
        {view === 'world' && (
          <>
            <PartnershipWorld
              brands={worldBrands}
              dragMode={dragMode}
              selectedId={selectedId}
              onSelect={(id) => (id ? onOpen(id) : onOpen(''))}
              onResetRef={(fn) => {
                resetViewRef.current = fn
              }}
            />
            <div className="pointer-events-none absolute inset-0">
              <div className="pointer-events-auto absolute left-4 top-4 flex items-center gap-2.5 rounded-xl border border-[#E9E9EB] bg-white/90 px-3.5 py-2.5 shadow-[0_3px_14px_rgba(60,58,50,.06)] backdrop-blur-md">
                <div className="h-[26px] w-[26px] rounded-lg border border-[#E5DFD1] bg-[#F2EFE7]" />
                <div>
                  <div className="text-[9px] font-semibold tracking-[1.5px] text-[#8e9189]">
                    THE PARTNERSHIP WORLD
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[#6f7370]">{worldSummary}</div>
                </div>
              </div>

              {live.length === 0 && (
                <div className="pointer-events-auto absolute left-1/2 top-1/2 w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#E9E9EB] bg-white/95 px-6 py-6 text-center shadow-[0_8px_30px_rgba(60,58,50,.08)] backdrop-blur-md">
                  <div className="mx-auto mb-3.5 h-[34px] w-[34px] rounded-xl border border-[#E5DFD1] bg-[#F2EFE7]" />
                  <h3 className="font-display text-[17px] text-[#1C1C1E]">
                    The world is built. Nothing lives in it yet.
                  </h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#6f7370]">
                    Add one brand and it appears at the Brand Radar. Everything after that follows the route —
                    research, idea, pitch, reply, terms, gate.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      onClick={() => onAdd()}
                      className="rounded-lg border-0 bg-[#C8A86B] px-3.5 py-2 text-[12px] font-medium text-[#191713]"
                    >
                      Add a brand
                    </button>
                  </div>
                </div>
              )}

              <div className="pointer-events-auto absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-2">
                <div className="flex flex-wrap items-center gap-4 rounded-full border border-[#E9E9EB] bg-white/90 px-4 py-2 text-[10.5px] text-[#6f7370] backdrop-blur-md">
                  <span className="flex items-center gap-1.5">
                    <i className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: WORLD_HEALTH_COLOR['Moving well'] }} />
                    Moving well
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: WORLD_HEALTH_COLOR['Needs attention'] }} />
                    Needs attention
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: WORLD_HEALTH_COLOR.Stalled }} />
                    Stalled
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: WORLD_HEALTH_COLOR.Waiting }} />
                    Waiting
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#E9E9EB] bg-white/90 px-3 py-2 text-[10.5px] text-[#8e9189] backdrop-blur-md">
                    {dragMode === 'pan' ? 'Drag to move · Scroll to zoom · Click a brand' : 'Drag to orbit · Scroll to zoom · Click a brand'}
                  </span>
                  <button
                    onClick={() => resetViewRef.current()}
                    className="rounded-full border border-[#E9E9EB] bg-white/90 px-3 py-2 text-[10.5px] text-[#4a4d48] backdrop-blur-md hover:border-[#dcd2ba] hover:text-[#1C1C1E]"
                  >
                    Reset view
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
        {view === 'table' && (
          <PartnershipTable opportunities={filtered} brandsById={brandsById} onOpen={onOpen} />
        )}
        {view === 'log' && (
          <RelationshipLog opportunities={filtered} brandsById={brandsById} onOpen={onOpen} />
        )}

        {view !== 'world' && filtered.length === 0 && live.length > 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="rounded-xl border border-[#E9E9EB] bg-white/95 px-5 py-4 text-center text-[12.5px] text-[#6f7370]">
              No brands match these filters.
            </div>
          </div>
        )}
      </div>

      {brands.some((b) => !b.deletedAt && !live.some((o) => o.brandId === b.id)) && (
        <div className="mx-8 mb-5 border-t border-[#E5E5E7] pt-4">
          <span className="text-[9px] font-semibold tracking-[1.5px] text-[#8e9189]">BRANDS TO EXPLORE</span>
          <p className="mb-2 mt-1 text-[12px] text-[#777b77]">
            Your saved brands without an active opportunity.
          </p>
          <div className="flex flex-wrap gap-2">
            {brands
              .filter((b) => !b.deletedAt && !live.some((o) => o.brandId === b.id))
              .map((b) => (
                <button
                  key={b.id}
                  onClick={() => onAdd(b.id)}
                  className="flex items-center gap-2 rounded-lg border border-[#E5E5E7] px-3 py-1.5 text-[12px] text-[#4a4d48]"
                >
                  {b.name}
                  <Plus size={12} strokeWidth={2} />
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
