import { useMemo, useState } from 'react'
import { Map as MapIcon, Table2, Search, ArrowUpRight, Check, Clock3, Compass, Plus, ArrowDownUp } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { stageChange, actionState, activityEntry, completeAction, daysUntil, formatActionDate, health, ISLAND_AREAS, lastContact, localDate, STAGES, TYPE_INFO, type Brand, type Opportunity } from '../../lib/partnerships'
import './opportunity-workspace.css'

const FILTERS = ['All', 'PR', 'Paid', 'UGC', 'Need Action', 'Waiting', 'Negotiating', 'Confirmed']
const shortType = (o: Opportunity) => o.type === 'unsure' ? 'Not sure' : o.type === 'paid' ? 'Paid' : o.type.toUpperCase()
const statusClass = (o: Opportunity) => health(o) === 'Healthy' ? 'healthy' : health(o) === 'Stalled' ? 'stalled' : 'attention'
function Monogram({ name }: { name: string }) { return <span className="ow-monogram">{name.split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase()}</span> }
function Health({ o }: { o: Opportunity }) { return <span className={`ow-health ${statusClass(o)}`}><i />{health(o)}</span> }
export function OpportunityWorkspace({ onOpen, onAdd }: { onOpen: (id: string) => void; onAdd: (brandId?: string) => void }) {
  const brands = useAppStore(s => s.brands)
  const opportunities = useAppStore(s => s.opportunities)
  const update = useAppStore(s => s.updateOpportunity)
  const updateBrand = useAppStore(s => s.updateBrand)
  const [view, setView] = useState<'map' | 'table'>('map')
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('brand')
  const [descending, setDescending] = useState(false)
  const [notice, setNotice] = useState('')
  const live = useMemo(() => opportunities.filter(o => !o.deletedAt), [opportunities])
  const byId = useMemo(() => new Map<string, Brand>(brands.filter(b => !b.deletedAt).map(b => [b.id, b])), [brands])
  const name = (o: Opportunity) => byId.get(o.brandId)?.name ?? 'Unknown brand'
  const visible = live.filter(o => {
    const matchesQuery = `${name(o)} ${o.title} ${o.nextAction} ${byId.get(o.brandId)?.contactEmail ?? ''}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'All' || shortType(o) === filter || (filter === 'Need Action' && health(o) !== 'Healthy') || (filter === 'Waiting' && o.stage === 'Pitched') || (filter === 'Negotiating' && o.stage === 'Negotiating') || (filter === 'Confirmed' && ['Agreed', 'In production'].includes(o.stage))
    return matchesQuery && matchesFilter
  }).sort((a,b) => {
    let compared = 0
    if (sort === 'due') compared = (a.nextActionDate || '9999').localeCompare(b.nextActionDate || '9999')
    else if (sort === 'stage') compared = STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)
    else if (sort === 'priority') compared = ['High','Normal','Low'].indexOf(a.priority ?? 'Normal') - ['High','Normal','Low'].indexOf(b.priority ?? 'Normal')
    else compared = name(a).localeCompare(name(b))
    return descending ? -compared : compared
  })
  const attention = live.filter(o => o.stage !== 'Paid' && (health(o) !== 'Healthy' || daysUntil(o.nextActionDate) === 1)).sort((a,b) => (daysUntil(a.nextActionDate) ?? 9999) - (daysUntil(b.nextActionDate) ?? 9999))
  function complete(o: Opportunity) { update(o.id, completeAction(o)); setNotice(`${name(o)}: action completed. The next step is ready.`) }
  function snooze(o: Opportunity) { update(o.id, { nextActionDate: localDate(1), activity: [...(o.activity ?? []), activityEntry('Snoozed next action until tomorrow')] }); setNotice(`${name(o)}: moved to tomorrow.`) }
  return <div className="ow-workspace">
    <section className="ow-today" aria-label="Today and needs attention">
      <div className="ow-section-heading"><div><span className="ow-eyebrow">YOUR NEXT MOVES</span><h2>Today <span>{attention.length}</span></h2></div><span className="ow-muted">A little momentum goes a long way.</span></div>
      {attention.length ? <div className="ow-today-cards">{attention.map(o => <article key={o.id} className="ow-today-card">
        <div className="ow-card-top"><b>{name(o)}</b><span className={`ow-dot ${statusClass(o)}`} /></div>
        <p>{o.nextAction || 'Set the next action'}</p><small>{actionState(o) === 'none' ? 'Needs a plan' : formatActionDate(o.nextActionDate)}</small>
        <div className="ow-card-actions"><button onClick={() => o.nextAction ? complete(o) : onOpen(o.id)} aria-label={`Complete action for ${name(o)}`}><Check size={12} />{o.nextAction ? 'Complete' : 'Set action'}</button><button onClick={() => snooze(o)} aria-label={`Snooze ${name(o)}`}><Clock3 size={12} />Snooze</button><button onClick={() => onOpen(o.id)} aria-label={`Open ${name(o)}`} title="Open brand"><ArrowUpRight size={15} /></button></div>
      </article>)}</div> : <div className="ow-clear"><Check size={16} /><span>{live.length ? 'You’re all caught up. Your next steps are scheduled.' : 'Your follow-ups will appear here. Start with a brand you have in mind.'}</span></div>}
      <div className="ow-notice" role="status">{notice}</div>
    </section>
    <section className="ow-main" aria-label="Opportunities workspace">
      <div className="ow-toolbar"><div><span className="ow-eyebrow">FROM FIRST IDEA TO LASTING RELATIONSHIP</span><h2>{view === 'map' ? 'Your partnership island' : 'Your opportunities'}</h2></div><div className="ow-view" aria-label="Opportunity view"><button aria-pressed={view === 'map'} onClick={() => setView('map')}><MapIcon size={14} />Map</button><button aria-pressed={view === 'table'} onClick={() => setView('table')}><Table2 size={14} />Table</button></div></div>
      <div className="ow-controls"><div className="ow-filters">{FILTERS.map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div><label className="ow-search"><Search size={14} /><input aria-label="Search opportunities" placeholder="Find a brand…" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
      <div className="ow-subbar"><span>{visible.length} {visible.length === 1 ? 'opportunity' : 'opportunities'} · {new Set(visible.map(o => o.brandId)).size} {new Set(visible.map(o => o.brandId)).size === 1 ? 'brand' : 'brands'}</span><div className="ow-sort"><select aria-label="Sort opportunities" value={sort} onChange={e => setSort(e.target.value)}><option value="brand">Brand name</option><option value="due">Next deadline</option><option value="stage">Journey stage</option><option value="priority">Priority</option></select><button aria-label={descending ? 'Sort ascending' : 'Sort descending'} onClick={() => setDescending(!descending)}><ArrowDownUp size={13} /></button></div></div>
      {view === 'map' ? <div className="ow-map-scroll"><div className="ow-island">
        <svg className="ow-topography" viewBox="0 0 1400 1100" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="island-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".65" fill="#b7bfb7" opacity=".35" /></pattern></defs><rect width="1400" height="1100" fill="url(#island-dots)" />{[0,1,2,3,4,5].map(i => <path key={i} transform={`translate(${i*24} ${i*19}) scale(${1-i*.035} ${1-i*.035})`} d="M90 320 C-70 150 320 -35 580 70 C820 -80 1330 65 1270 340 C1430 500 1310 670 1240 760 C1170 1060 760 1030 610 960 C290 1100 40 920 100 720 C-40 590 30 420 90 320Z" fill={i === 0 ? '#edf0e7' : 'none'} stroke="#ccd4c5" strokeWidth="1" opacity={i === 0 ? '.8' : '.65'} />)}<path d="M170 220 C410 30 520 250 700 220 S1170 100 1200 370 S540 620 240 510 S80 910 410 850 S1030 630 1200 910" stroke="#fcfcf9" strokeWidth="8" fill="none" /><path d="M170 220 C410 30 520 250 700 220 S1170 100 1200 370 S540 620 240 510 S80 910 410 850 S1030 630 1200 910" stroke="#c4bb9c" strokeWidth="1.4" strokeDasharray="4 6" fill="none" /></svg>
        <div className="ow-map-title"><Compass size={21} /><span>THE PARTNERSHIP ISLAND<small>Every relationship has a place.</small></span></div>
        <div className="ow-regions">{ISLAND_AREAS.map((area,i) => {
          const items = visible.filter(o => area.stages.includes(o.stage))
          return <section className={`ow-region ow-region-${i}`} key={area.name}><div className="ow-region-label"><span>{String(i+1).padStart(2,'0')}</span><div><h3>{area.name}</h3><p>{area.hint}</p></div><b>{items.length}</b></div>
            <div className="ow-region-nodes">{items.map(o => <button className="ow-node" key={o.id} onClick={() => onOpen(o.id)}><div className="ow-node-brand"><Monogram name={name(o)} /><div><b>{name(o)}</b><small>{shortType(o)} · {o.stage}</small></div><ArrowUpRight size={13} /></div><p>{o.nextAction || 'Set the next action'}</p><div className="ow-node-foot"><span className={`ow-dot ${statusClass(o)}`} title={health(o)} /><span>{formatActionDate(o.nextActionDate) || 'No deadline'}</span><span>{o.priority === 'High' ? 'High priority' : ''}</span></div></button>)}{!items.length && <div className="ow-region-empty">{live.length ? 'Room for your next chapter' : 'Your journey starts here'}</div>}</div>
          </section>
        })}</div><div className="ow-map-legend"><span><i className="ow-dot healthy" />Healthy</span><span><i className="ow-dot attention" />Needs attention</span><span><i className="ow-dot stalled" />Stalled</span></div>
      </div></div> : <div className="ow-table-scroll"><table className="ow-table"><thead><tr>{['Brand','Type','Stage','Next action','Due','Contact','Last contact','Value','Priority','Health'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(o => <tr key={o.id}>
        <td><button className="ow-table-brand" onClick={() => onOpen(o.id)}><Monogram name={name(o)} /><b>{name(o)}</b><ArrowUpRight size={12} /></button></td>
        <td><select aria-label={`Type for ${name(o)}`} value={o.type} onChange={e => update(o.id, { type: e.target.value as Opportunity['type'] })}>{Object.values(TYPE_INFO).map(t => <option key={t.id} value={t.id}>{t.id === 'unsure' ? 'Not sure' : t.id === 'paid' ? 'Paid' : t.id.toUpperCase()}</option>)}</select></td>
        <td><select aria-label={`Stage for ${name(o)}`} value={o.stage} onChange={e => update(o.id, stageChange(o, e.target.value as Opportunity['stage']))}>{STAGES.map(s => <option key={s}>{s}</option>)}</select></td>
        <td><input aria-label={`Next action for ${name(o)}`} value={o.nextAction} placeholder="Add next step" onChange={e => update(o.id,{nextAction:e.target.value})} /></td>
        <td><input type="date" aria-label={`Deadline for ${name(o)}`} value={o.nextActionDate} onChange={e => update(o.id,{nextActionDate:e.target.value})} /></td>
        <td><input type="email" aria-label={`Contact for ${name(o)}`} value={byId.get(o.brandId)?.contactEmail ?? ''} placeholder="Add email" disabled={!byId.has(o.brandId)} onChange={e => updateBrand(o.brandId,{contactEmail:e.target.value})} /></td>
        <td className="ow-muted">{lastContact(o) ? new Date(lastContact(o)).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : 'Not logged'}</td>
        <td><input aria-label={`Value for ${name(o)}`} value={o.fee} placeholder="—" onChange={e => update(o.id,{fee:e.target.value})} /></td>
        <td><select aria-label={`Priority for ${name(o)}`} value={o.priority ?? 'Normal'} onChange={e => update(o.id,{priority:e.target.value as Opportunity['priority']})}>{['High','Normal','Low'].map(p => <option key={p}>{p}</option>)}</select></td><td><Health o={o} /></td>
      </tr>)}</tbody></table></div>}
      {visible.length === 0 && <div className="ow-empty"><Compass size={25} /><h3>{live.length ? 'No opportunities match these filters' : 'Start with one brand. See where it goes.'}</h3><p>{live.length ? 'Try another search or show all opportunities.' : 'Add a brand and Director will lay out your next steps.'}</p><button className="ow-primary" onClick={live.length ? () => {setQuery('');setFilter('All')} : () => onAdd()}><Plus size={14} />{live.length ? 'Clear filters' : 'Add opportunity'}</button></div>}
    </section>
    {brands.some(b => !b.deletedAt && !live.some(o => o.brandId === b.id)) && <section className="mt-6 border-t border-[#e5e5e7] pt-5"><span className="ow-eyebrow">BRANDS TO EXPLORE</span><p className="mb-3 text-[12px] text-[#777b77]">Your saved brands without an active opportunity.</p><div className="flex flex-wrap gap-2">{brands.filter(b => !b.deletedAt && !live.some(o => o.brandId === b.id)).map(b => <button key={b.id} onClick={() => onAdd(b.id)} className="flex items-center gap-2 rounded-lg border border-[#e5e5e7] px-3 py-2 text-[12px]"><Monogram name={b.name} />{b.name}<Plus size={12}/></button>)}</div></section>}
  </div>
}
