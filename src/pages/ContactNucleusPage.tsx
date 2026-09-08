import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import {
  CONFIDENCES, CONTACT_SOURCES, CONTACT_STATES, DEPARTMENTS, REPLY_STATES, SENIORITIES,
  STRENGTHS, TYPE_DEPARTMENTS, TYPE_LABEL,
  availableChannels, findDuplicate, hasAnyRoute, recommendContacts,
  type Contact,
} from '../lib/contacts'
import {
  STATUS_META, buildStage, contactStatus, preferredRoute, relationshipStrength,
} from '../lib/nucleus'
import { contrastInk, shadesOf } from '../lib/brandColor'
import { CHANNELS, journeyFor, type Channel } from '../lib/partnerships'
import { NucleusStage, type NucleusHandle } from '../components/partnerships/NucleusStage'
import { toast } from '../lib/toast'
import { ExternalLink, Search } from '../components/Icon'

/**
 * Contact Nucleus — choosing who a pitch goes to, and why them.
 *
 * The brand is the nucleus. Its departments orbit it, its people orbit their
 * department, and every sphere is a shade of the brand's own colour so a network
 * reads at a glance as belonging to that brand. Status is not carried by colour:
 * it rides on the line into each person, because a line is a relationship and a
 * sphere is a person.
 *
 * The rule that shapes everything else here is provenance. Director has no Gmail,
 * LinkedIn or Instagram connector — none — so it cannot read a company's staff
 * list, cannot send on your behalf, and will not draw a sphere for someone it
 * invented. Every field on this page was typed in by the user and carries the
 * source they gave it. That is why there is no "Send through Gmail" button and
 * why the empty state says what it says: an invented address costs a fortnight
 * of silence before anyone finds out.
 *
 * The recommendation shows its reasons and its doubts together, and anyone can
 * be chosen regardless of where the stage puts them.
 */

/** When a brand has no colour set, the nucleus borrows the product's own gold
 * rather than inventing an identity for someone else's company. */
const FALLBACK = '#C8A86B'

const EYEBROW = 'text-[9px] font-semibold uppercase tracking-[1.2px] text-[#8e9189]'
const CTRL =
  'rounded-lg border border-[#E5E5E7] bg-white px-2.5 py-[7px] text-[11.5px] text-[#4a4d48] outline-none focus:border-[#C8A86B]'

const STRENGTH_FILTERS = ['Any strength', 'Warm or replied', 'Strong only'] as const
type StrengthFilter = (typeof STRENGTH_FILTERS)[number]

const monogram = (name: string) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there'

const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Notes are stored as free text; each paragraph is one logged entry. */
function noteLines(notes: string): { when: string; text: string }[] {
  return notes
    .split(/\n{2,}|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d{1,2}\s+\w{3})\s+—\s+(.*)$/)
      return m ? { when: m[1], text: m[2] } : { when: '—', text: l }
    })
}

export function ContactNucleusPage() {
  const { opportunityId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const opportunities = useAppStore((s) => s.opportunities)
  const brands = useAppStore((s) => s.brands)
  const contacts = useAppStore((s) => s.contacts)
  const createContact = useAppStore((s) => s.createContact)
  const updateContact = useAppStore((s) => s.updateContact)
  const updateOpportunity = useAppStore((s) => s.updateOpportunity)

  const [selId, setSelId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [view, setView] = useState<'network' | 'list'>('network')
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState('All departments')
  const [channel, setChannel] = useState('All channels')
  const [strength, setStrength] = useState<StrengthFilter>('Any strength')
  const [onlyContacted, setOnlyContacted] = useState(false)
  const [onlyUncontacted, setOnlyUncontacted] = useState(false)
  const [showAgency, setShowAgency] = useState(true)
  const [showWhy, setShowWhy] = useState(false)
  const [draft, setDraft] = useState('')
  // Which contact's card is open for editing, not a bare boolean: a flag would
  // follow you onto the next person you clicked.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))

  const stage = useRef<NucleusHandle>(null)

  const opportunity = opportunities.find((o) => o.id === opportunityId && !o.deletedAt)
  const brand = brands.find((b) => b.id === opportunity?.brandId)
  const type = opportunity?.type ?? 'unsure'
  const brandColor = brand?.color || FALLBACK
  const brandName = brand?.name ?? 'this brand'

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const mine = useMemo(
    () => contacts.filter((c) => !c.deletedAt && c.brandId === opportunity?.brandId),
    [contacts, opportunity?.brandId],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return mine.filter((c) => {
      if (q && !`${c.name} ${c.role} ${c.department}`.toLowerCase().includes(q)) return false
      if (dept !== 'All departments' && (c.department || 'Unassigned') !== dept) return false
      if (channel !== 'All channels' && preferredRoute(c) !== channel) return false
      const st = contactStatus(c)
      if (strength === 'Strong only' && relationshipStrength(c) < 0.55) return false
      if (strength === 'Warm or replied' && st !== 'warm' && st !== 'replied') return false
      if (onlyContacted && st === 'uncontacted') return false
      if (onlyUncontacted && st !== 'uncontacted') return false
      if (!showAgency && c.department === 'Agency') return false
      return true
    })
  }, [mine, query, dept, channel, strength, onlyContacted, onlyUncontacted, showAgency])

  const untouched =
    !query && dept === 'All departments' && channel === 'All channels' &&
    strength === 'Any strength' && !onlyContacted && !onlyUncontacted && showAgency
  const visibleIds = untouched ? null : filtered.map((c) => c.id)

  const ranked = useMemo(() => recommendContacts(mine, type), [mine, type])
  const departments = useMemo(() => buildStage(mine, type), [mine, type])

  /**
   * One shade per person, off the brand's own colour, deepest first in ranked
   * order — so neighbouring spheres are always tellable apart and the person
   * Director would pick is the one the eye lands on. Departments take shades
   * from the same ladder, so a desk and its people belong together visually.
   */
  const { shades, deptShades } = useMemo(() => {
    const ladder = shadesOf(brandColor, Math.max(ranked.length, 1)).reverse()
    const byPerson: Record<string, string> = {}
    ranked.forEach((r, i) => { byPerson[r.contact.id] = ladder[i] ?? brandColor })
    for (const c of mine) if (!byPerson[c.id]) byPerson[c.id] = ladder.at(-1) ?? brandColor

    const dl = shadesOf(brandColor, Math.max(departments.length, 1))
    const byDept: Record<string, string> = {}
    departments.forEach((d, i) => { byDept[d.key] = dl[i] ?? brandColor })
    return { shades: byPerson, deptShades: byDept }
  }, [brandColor, ranked, departments, mine])

  const byId = useMemo(() => new Map(mine.map((c) => [c.id, c])), [mine])
  const sel = selId ? byId.get(selId) ?? null : null
  const top = ranked[0]
  const recipient = mine.find((c) => c.id === opportunity?.recipientContactId) ?? null

  useEffect(() => {
    if (selId && !byId.has(selId)) setSelId(null)
  }, [selId, byId])

  // Arriving from the pitch panel's "Add a contact" lands on an open, empty card
  // rather than on a stage the user then has to hunt through. Guarded by a ref
  // so StrictMode's double-invoke cannot leave a stray second blank record.
  const added = useRef(false)
  const wantsNew = params.get('add') === '1'
  useEffect(() => {
    if (!wantsNew || !opportunity || added.current) return
    added.current = true
    setParams((p) => { const n = new URLSearchParams(p); n.delete('add'); return n }, { replace: true })
    setSelId(createContact(opportunity.brandId).id)
  }, [wantsNew, opportunity, createContact, setParams])

  if (!opportunity) {
    return (
      <div className="grid h-full place-items-center bg-white">
        <div className="text-center">
          <p className="text-[13px] text-[#6f7370]">That opportunity no longer exists.</p>
          <Link to="/partnerships" className="mt-2 inline-block text-[13px] font-medium text-[#8f6d33] hover:underline">
            Back to Partnerships
          </Link>
        </div>
      </div>
    )
  }

  const backToPitch = `/partnerships?open=${opportunity.id}`

  function add() {
    // A record with no name opens straight into the form, so there is never a
    // blank card sitting there waiting to be noticed.
    setSelId(createContact(opportunity!.brandId).id)
  }

  function choose(contact: Contact, ch: Channel) {
    updateOpportunity(opportunity!.id, { recipientContactId: contact.id, recipientChannel: ch })
    toast.success(`Pitch addressed to ${contact.name || 'this contact'} on ${ch}.`)
    stage.current?.signal(contact.id)
  }

  function toggleCc(contact: Contact) {
    const current = opportunity!.ccContactIds ?? []
    const next = current.includes(contact.id)
      ? current.filter((id) => id !== contact.id)
      : [...current, contact.id]
    updateOpportunity(opportunity!.id, { ccContactIds: next })
  }

  function addNote() {
    const text = draft.trim()
    if (!text || !sel) return
    updateContact(sel.id, { notes: [`${today()} — ${text}`, sel.notes].filter(Boolean).join('\n\n') })
    setDraft('')
  }

  function resetView() {
    setQuery(''); setDept('All departments'); setChannel('All channels')
    setStrength('Any strength'); setOnlyContacted(false); setOnlyUncontacted(false)
    setShowAgency(true); setExpanded(null); setSelId(null)
    stage.current?.reset()
  }

  const narrow = width < 1280
  const tight = width < 1060
  const asideWidth = tight ? 320 : narrow ? 360 : 412

  const steps = journeyFor(opportunity)
  const hereIndex = Math.max(0, steps.findIndex((s) => /find contacts/i.test(s.label)))
  const stepNumber = String(hereIndex + 1).padStart(2, '0')

  const routedNames = TYPE_DEPARTMENTS[type]
  const empty = mine.length === 0
  const canContinue = Boolean(recipient && contactStatus(recipient) !== 'invalid')

  return (
    <div className="flex h-full overflow-hidden bg-white text-[#1C1C1E]">
      {/* ------------------------------------------------------ pitch rail --- */}
      {!tight && (
        <aside className="flex w-[232px] shrink-0 flex-col border-r border-[#26241f] bg-[#171613] text-[#f3ede0]">
          {/* This rail stands in for the app's nav while the pitch flow has the
              screen, so it carries the wordmark too. */}
          <Link to="/partnerships" className="flex items-center gap-2.5 px-5 pb-[18px] pt-6">
            <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-[#C8A86B]">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#141316" strokeWidth="1.4">
                <rect x="1.5" y="4.5" width="13" height="9" rx="1.5" />
                <path d="M1.5 7.5h13" />
              </svg>
            </span>
            <span className="font-display text-[16px] tracking-[-0.3px] text-[#f3ede0]">Director OS</span>
          </Link>
          <div className="px-4 pb-3.5">
            <div className="rounded-[10px] border border-[#2c2a24] bg-[#1e1c18] px-3 py-[11px]">
              <div className="text-[9px] font-semibold tracking-[1.2px] text-[#7d766a]">PITCH BUILDER</div>
              <div className="mt-1.5 truncate text-[12.5px] text-[#f3ede0]">
                {opportunity.title || 'Untitled pitch'}
              </div>
              <div className="mt-[3px] truncate text-[10.5px] text-[#948e83]">
                {brandName} · {TYPE_LABEL[type]}
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-0.5 px-3">
            {steps.slice(0, 8).map((s, i) => {
              const done = Boolean(s.completedAt) || i < hereIndex
              const here = i === hereIndex
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[12.5px]"
                  style={{ background: here ? '#211f1b' : 'transparent', color: here ? '#f3ede0' : done ? '#948e83' : '#5f5a51' }}
                >
                  <span
                    className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full font-mono text-[8.5px] font-semibold"
                    style={{
                      border: `1px solid ${here ? '#C8A86B' : done ? '#4a463f' : '#33302a'}`,
                      background: done ? '#C8A86B' : 'transparent',
                      color: done ? '#191713' : here ? '#C8A86B' : '#5f5a51',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate">{s.label}</span>
                </div>
              )
            })}
          </nav>

          <div className="flex-1" />

          {/*
            The design left room here for connected accounts. Director has none —
            no Gmail, LinkedIn or Instagram connector exists — so rather than a
            row of "connect" buttons that lead nowhere, this says the true thing.
          */}
          <div className="px-4 pb-4">
            <div className="border-t border-[#26241f] pt-3.5 text-[10.5px] leading-[1.55] text-[#7d766a]">
              Connectors: <span className="text-[#f3ede0]">None</span>
              <div className="mt-1">Director cannot read a staff list or send for you. Everyone here you added.</div>
            </div>
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ---------------------------------------------------------- head --- */}
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-4 border-b border-[#EDEDEF] px-[30px] pb-4 pt-[22px]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[9px] font-semibold tracking-[1.6px] text-[#8e9189]">
              <span>STEP {stepNumber}</span>
              <span className="text-[#dcdcde]">·</span>
              <span className="text-[#8f6d33]">CONTACT NUCLEUS</span>
            </div>
            <h1 className="mt-[7px] font-display text-[25px] tracking-[-0.5px] text-[#1C1C1E]">
              {empty ? `Nobody at ${brandName} yet.` : 'Your pitch is ready. Now choose the right person.'}
            </h1>
            <p className="mt-[5px] max-w-[620px] text-[12.5px] leading-[1.5] text-[#6f7370]">
              {empty
                ? `${brandName} sits at the centre. Add a contact and it takes its place in the right department orbit.`
                : `${brandName} sits at the centre. Departments orbit the brand, people orbit their department, and the lines carry your real relationship status.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={backToPitch}
              className="rounded-[9px] border border-[#E5E5E7] bg-white px-[13px] py-[9px] text-[12px] text-[#4a4d48] transition hover:border-[#dcd2ba] hover:text-[#1C1C1E]"
            >
              ← Back to the pitch
            </Link>
            <button
              onClick={() => canContinue && navigate(backToPitch)}
              disabled={!canContinue}
              className="rounded-[9px] px-[15px] py-[10px] text-[12.5px] font-medium transition"
              style={{
                background: canContinue ? '#C8A86B' : '#F0F0EE',
                color: canContinue ? '#191713' : '#a9a7a0',
                cursor: canContinue ? 'pointer' : 'default',
              }}
            >
              {canContinue
                ? `Continue with ${firstName(recipient!.name || 'this contact')} →`
                : 'Choose a recipient to continue'}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1">
          {/* -------------------------------------------------------- stage --- */}
          <div
            className="relative flex flex-1 flex-col overflow-hidden bg-[#F7F7F5]"
            style={{ minWidth: narrow ? 380 : 520 }}
          >
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#E9E9EB] bg-white/70 px-[18px] py-2.5 backdrop-blur-md">
              <label className="flex items-center gap-[7px] rounded-lg border border-[#E5E5E7] bg-white px-2.5 py-1.5 text-[#9a9d97]">
                <Search size={12} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search contacts…"
                  aria-label="Search contacts"
                  className="w-[126px] border-0 bg-transparent text-[11.5px] text-[#1C1C1E] outline-none"
                />
              </label>
              <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter by department" className={CTRL}>
                {['All departments', 'Unassigned', ...DEPARTMENTS].map((d) => <option key={d}>{d}</option>)}
              </select>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Filter by channel" className={CTRL}>
                {['All channels', ...CHANNELS].map((c) => <option key={c}>{c}</option>)}
              </select>
              <select
                value={strength}
                onChange={(e) => setStrength(e.target.value as StrengthFilter)}
                aria-label="Filter by relationship strength"
                className={CTRL}
              >
                {STRENGTH_FILTERS.map((s) => <option key={s}>{s}</option>)}
              </select>
              <div className="flex gap-1.5">
                <Toggle on={onlyContacted} onClick={() => setOnlyContacted((v) => !v)}>Contacted</Toggle>
                <Toggle on={onlyUncontacted} onClick={() => setOnlyUncontacted((v) => !v)}>Uncontacted</Toggle>
                <Toggle on={showAgency} onClick={() => setShowAgency((v) => !v)}>Agency</Toggle>
              </div>
              <div className="ml-auto flex gap-1.5">
                <button
                  onClick={() => {
                    setSelId(null)
                    setExpanded((v) => (v ? null : departments.find((d) => d.relevant)?.key ?? null))
                  }}
                  className="rounded-lg border border-[#E5E5E7] bg-white px-[11px] py-[7px] text-[11px] text-[#4a4d48]"
                >
                  {expanded ? 'Collapse department' : 'Expand relevant'}
                </button>
                <button onClick={resetView} className="rounded-lg border border-[#E5E5E7] bg-white px-[11px] py-[7px] text-[11px] text-[#4a4d48]">
                  Reset view
                </button>
                <div className="flex gap-[3px] rounded-[9px] border border-[#E8E8E2] bg-[#F3F3F0] p-[3px]">
                  {(['network', 'list'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className="rounded-md px-[11px] py-1.5 text-[11px] capitalize"
                      style={{
                        background: view === v ? '#ffffff' : 'transparent',
                        color: view === v ? '#1C1C1E' : '#81817a',
                        boxShadow: view === v ? '0 1px 4px rgba(0,0,0,.07)' : 'none',
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              {view === 'network' ? (
                <div className="absolute inset-0">
                  <NucleusStage
                    ref={stage}
                    brandName={brandName}
                    brandColor={brandColor}
                    typeLabel={TYPE_LABEL[type]}
                    departments={departments}
                    shades={shades}
                    deptShades={deptShades}
                    selectedId={selId}
                    expandedDept={expanded}
                    visibleIds={visibleIds}
                    reduceMotion={reduceMotion}
                    onPickPerson={(id) => { setSelId(id); setExpanded(null) }}
                    onPickDept={(key) => { setExpanded((v) => (v === key ? null : key)); setSelId(null) }}
                    onPickNone={() => setExpanded(null)}
                  />

                  {!narrow && !empty && (
                    <>
                      <div className="absolute left-3.5 top-3.5 rounded-xl border border-[#E9E9EB] bg-white/90 px-[13px] py-[11px] shadow-[0_3px_14px_rgba(60,58,50,.06)] backdrop-blur-md">
                        <div className={EYEBROW} style={{ letterSpacing: '1.4px' }}>
                          ROUTED FOR {TYPE_LABEL[type].toUpperCase()}
                        </div>
                        <div className="mt-1.5 flex max-w-[250px] flex-wrap gap-[5px]">
                          {routedNames.map((d) => (
                            <span key={d} className="rounded-full border border-[#C8A86B]/45 bg-[#C8A86B]/10 px-2 py-0.5 text-[10px] text-[#8f6d33]">
                              {d}
                            </span>
                          ))}
                        </div>
                        <div className="mt-[7px] text-[10px] text-[#9a9d97]">Other departments stay visible but quieter.</div>
                      </div>

                      <div className="absolute bottom-3.5 left-3.5 flex flex-wrap items-center gap-[13px] rounded-full border border-[#E9E9EB] bg-white/90 px-[15px] py-2 text-[10px] text-[#6f7370] backdrop-blur-md">
                        <Legend color="#C8A86B">Warm</Legend>
                        <Legend color="#5f7d69">Replied</Legend>
                        <Legend color="#b4b2ab">Not contacted</Legend>
                        <Legend color="#b4b2ab" dashed>Uncertain</Legend>
                        <Legend color="#a05f57" dashed>Unreachable</Legend>
                      </div>

                      <div className="absolute bottom-3.5 right-3.5 rounded-full border border-[#E9E9EB] bg-white/90 px-[13px] py-2 text-[10px] text-[#8e9189] backdrop-blur-md">
                        Drag to rotate · Scroll to zoom · Click a person
                      </div>
                    </>
                  )}

                  {empty && (
                    <div className="absolute left-1/2 top-1/2 w-[352px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#E9E9EB] bg-white/95 p-6 text-center shadow-[0_10px_34px_rgba(60,58,50,.09)] backdrop-blur-md">
                      <h3 className="m-0 font-display text-[17px] text-[#1C1C1E]">No contacts connected yet.</h3>
                      <p className="mx-0 mb-4 mt-2 text-[12px] leading-[1.55] text-[#6f7370]">
                        The {brandName} nucleus and its department orbits are waiting. Director cannot read a
                        company's staff list, so add one person and the network builds around them.
                      </p>
                      <button
                        onClick={add}
                        className="w-full rounded-[9px] border border-[#C8A86B]/55 bg-[#C8A86B]/10 px-3 py-[9px] text-left text-[12px] text-[#7d5f2c] transition hover:border-[#dcd2ba]"
                      >
                        Add a contact
                        <span className="float-right text-[10.5px] text-[#9a9d97]">manually</span>
                      </button>
                    </div>
                  )}

                  {recipient && (
                    <div className="absolute left-1/2 top-3.5 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-[#C8A86B]/55 bg-white/95 px-[15px] py-2 shadow-[0_4px_16px_rgba(60,58,50,.07)] backdrop-blur-md">
                      <span className="h-[7px] w-[7px] rounded-full bg-[#C8A86B]" />
                      <span className="text-[11.5px] font-medium text-[#1C1C1E]">Pitch recipient selected</span>
                      <span className="text-[11.5px] text-[#6f7370]">
                        {recipient.name || 'Unnamed contact'} · {opportunity.recipientChannel}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="absolute inset-0 overflow-auto bg-white">
                  <table className="w-full border-collapse text-[11.5px]">
                    <thead>
                      <tr>
                        {['Contact', 'Department', 'Status', 'Route', 'Strength', 'Last contacted', 'Reply', 'Source', 'Action'].map((c) => (
                          <th
                            key={c}
                            className="sticky top-0 whitespace-nowrap border-b border-[#E5E5E7] bg-[#F7F7F5] px-3 py-[11px] text-left text-[10px] font-medium text-[#83867e]"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => {
                        const st = contactStatus(c)
                        const meta = STATUS_META[st]
                        const picked = opportunity.recipientContactId === c.id
                        const route = preferredRoute(c)
                        const bars = Math.max(1, Math.round(relationshipStrength(c) * 5))
                        return (
                          <tr
                            key={c.id}
                            className="border-b border-[#F2F2F4] hover:bg-[#FCFBF8]"
                            style={{ background: st === 'invalid' ? '#FCFAF9' : selId === c.id ? '#FBF7EF' : '#ffffff' }}
                          >
                            <td className="px-3 py-[11px]">
                              <button onClick={() => setSelId(c.id)} className="flex items-center gap-2.5 text-left">
                                <span
                                  className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-full text-[9.5px] font-semibold"
                                  style={{ background: shades[c.id] ?? brandColor, color: contrastInk(shades[c.id] ?? brandColor) }}
                                >
                                  {monogram(c.name)}
                                </span>
                                <span>
                                  <b className="block text-[11.5px] font-medium text-[#1C1C1E]">{c.name || 'Unnamed contact'}</b>
                                  <span className="text-[10.5px] text-[#8e9189]">{c.role || 'No role recorded'}</span>
                                </span>
                              </button>
                            </td>
                            <td className="px-3 py-[11px] text-[#6f7370]">{c.department || 'Unassigned'}</td>
                            <td className="px-3 py-[11px]">
                              <span className="flex items-center gap-1.5" style={{ color: meta.color }}>
                                <i className="h-[5px] w-[5px] rounded-full" style={{ background: meta.color }} />
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-3 py-[11px] text-[#6f7370]">{route ?? 'No route'}</td>
                            <td className="px-3 py-[11px] font-mono text-[10.5px] text-[#4a4d48]">
                              {'▮'.repeat(bars)}{'▯'.repeat(5 - bars)}
                            </td>
                            <td className="px-3 py-[11px] text-[#8e9189]">{c.lastContactedAt || '—'}</td>
                            <td className="px-3 py-[11px] text-[#8e9189]">{c.replyState}</td>
                            <td className="px-3 py-[11px]">
                              <span className="rounded-full border border-[#E9E9EB] px-2 py-[3px] text-[10px] text-[#6f7370]">
                                {c.source}
                              </span>
                            </td>
                            <td className="px-3 py-[11px]">
                              <button
                                onClick={() => setSelId(c.id)}
                                className="rounded-[7px] border px-2.5 py-1.5 text-[10.5px]"
                                style={{
                                  borderColor: picked ? 'rgba(200,168,107,.6)' : '#E5E5E7',
                                  background: picked ? 'rgba(200,168,107,.1)' : '#ffffff',
                                  color: picked ? '#7d5f2c' : st === 'invalid' ? '#9a9d97' : '#4a4d48',
                                }}
                              >
                                {picked ? 'Selected' : 'Open'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-[11.5px] text-[#8e9189]">
                            {empty ? 'No contacts for this brand yet.' : 'Nobody here matches those filters.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ---------------------------------------------------------- rail --- */}
          <aside
            className="flex shrink-0 flex-col border-l border-[#E5E5E7] bg-white"
            style={{ width: asideWidth, minWidth: 288 }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[26px] pt-[18px]">
              {/* ------------------------------------------ recommendation --- */}
              <div className="mb-4 rounded-xl border border-[#C8A86B]/45 bg-[#C8A86B]/[.07] p-3.5">
                <div className="flex items-center gap-[7px] text-[9px] font-semibold tracking-[1.2px] text-[#8f6d33]">
                  <i className="h-[5px] w-[5px] rounded-full bg-[#C8A86B]" />
                  DIRECTOR RECOMMENDATION
                </div>
                {top ? (
                  <>
                    <p className="mt-[9px] text-[13px] leading-[1.55] text-[#3a3a3c]">
                      {/* The reason is shown verbatim — lowercasing its first
                          word to graft it onto the name mangles "Creator
                          Partnerships is the right desk…" into nonsense. */}
                      <b className="font-semibold">{top.contact.name || 'This contact'}</b>
                      {top.contact.role ? `, ${top.contact.role}` : ''}.{' '}
                      {top.reasons[0] ?? `Nothing is recorded about this relationship yet, so this is a ranking by department fit alone.`}
                    </p>
                    {top.cautions.map((c) => (
                      <p key={c} className="mt-[9px] border-t border-[#C8A86B]/30 pt-[9px] text-[12px] leading-[1.5] text-[#6f7370]">
                        {c}
                      </p>
                    ))}
                    <div className="mt-3 flex flex-wrap gap-[7px]">
                      <button
                        onClick={() => { setSelId(top.contact.id); setExpanded(null) }}
                        className="rounded-lg bg-[#1C1C1E] px-[13px] py-2 text-[11.5px] font-medium text-white transition hover:bg-[#33333a]"
                      >
                        Select {firstName(top.contact.name || 'contact')}
                      </button>
                      <button
                        onClick={() => setShowWhy((v) => !v)}
                        className="rounded-lg border border-[#C8A86B]/50 bg-white px-[13px] py-2 text-[11.5px] text-[#7d5f2c]"
                      >
                        {showWhy ? 'Hide reasoning' : 'Why this person'}
                      </button>
                    </div>
                    {showWhy && (
                      <div className="mt-[11px] border-t border-[#C8A86B]/30 pt-2.5">
                        {[...top.reasons, ...top.cautions].map((r, i) => (
                          <div key={r} className="flex gap-2.5 py-1 text-[11.5px] leading-[1.5] text-[#4a4d48]">
                            <span className="shrink-0 font-mono text-[10px] text-[#a9a294]">
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <span>{r}</span>
                          </div>
                        ))}
                        <p className="mt-2 text-[10.5px] leading-[1.5] text-[#9a9d97]">
                          Reachability comes first, then reply history, then the right desk for this deal.
                          Seniority is weighted last — the manager who runs it day to day answers their own inbox.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-[9px] text-[13px] leading-[1.55] text-[#3a3a3c]">
                    No contacts on file for {brandName} yet. Add one person — a named partnerships contact beats
                    a general inbox by a wide margin.
                  </p>
                )}
              </div>

              {/* -------------------------------------------- warm intro --- */}
              {sel?.introducedById && byId.get(sel.introducedById) && (
                <div className="mb-4 rounded-xl border border-[#EDEDEF] p-[13px]">
                  <div className={EYEBROW}>WARM INTRODUCTION PATH</div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-[7px]">
                    <span className="rounded-lg border border-[#E5E5E7] bg-white px-2.5 py-1.5 text-[11px] text-[#4a4d48]">You</span>
                    <span className="text-[11px] text-[#c8c6c0]">→</span>
                    <span className="rounded-lg border border-[#C8A86B]/55 bg-[#C8A86B]/10 px-2.5 py-1.5 text-[11px] text-[#7d5f2c]">
                      {byId.get(sel.introducedById)!.name || 'Your contact'}
                    </span>
                    <span className="text-[11px] text-[#c8c6c0]">→</span>
                    <span className="rounded-lg border border-[#5f7d69]/40 bg-[#7a9681]/10 px-2.5 py-1.5 text-[11px] text-[#4d7a4a]">
                      {sel.name || 'This contact'}
                    </span>
                  </div>
                  <p className="mt-[9px] text-[11.5px] leading-[1.5] text-[#6f7370]">
                    You recorded this introduction yourself. A line from someone they already know carries
                    further than a cold, correct address.
                  </p>
                </div>
              )}

              {/* -------------------------------------------------- detail --- */}
              {sel ? (
                <SelectedContact
                  contact={sel}
                  brandName={brandName}
                  shade={shades[sel.id] ?? brandColor}
                  isRecipient={opportunity.recipientContactId === sel.id}
                  isCc={(opportunity.ccContactIds ?? []).includes(sel.id)}
                  duplicate={findDuplicate(sel, mine.filter((x) => x.id !== sel.id))}
                  editing={editingId === sel.id || sel.name.trim() === ''}
                  onToggleEdit={() => setEditingId((v) => (v === sel.id ? null : sel.id))}
                  onPatch={(p) => updateContact(sel.id, p)}
                  onChoose={(ch) => choose(sel, ch)}
                  onToggleCc={() => toggleCc(sel)}
                  draft={draft}
                  onDraft={setDraft}
                  onAddNote={addNote}
                  loaded={
                    recipient
                      ? [
                          { k: 'Greeting', v: `Hi ${firstName(recipient.name)},` },
                          {
                            k: 'Pitch format',
                            v: opportunity.recipientChannel === 'Email'
                              ? 'Full email pitch'
                              : `Short ${opportunity.recipientChannel} message with the pitch pasted in`,
                          },
                          {
                            k: 'Context carried',
                            v: recipient.lastContactedAt
                              ? `Your last conversation on ${recipient.lastContactedAt}`
                              : 'No previous conversation — opens cold',
                          },
                          { k: 'Recommended channel', v: `${opportunity.recipientChannel} — send it yourself, then log it` },
                          { k: 'Attached to', v: `${opportunity.title || 'This pitch'} · ${TYPE_LABEL[type]} · ${brandName}` },
                        ]
                      : []
                  }
                />
              ) : (
                <div className="border-t border-[#EDEDEF] pt-[18px]">
                  <div className={`${EYEBROW} mb-2.5`}>POSSIBLE RECIPIENTS</div>
                  {ranked.slice(0, 5).map((r, i) => {
                    const st = contactStatus(r.contact)
                    const meta = STATUS_META[st]
                    const best = i === 0
                    return (
                      <button
                        key={r.contact.id}
                        onClick={() => setSelId(r.contact.id)}
                        className="mb-2 flex w-full items-start gap-[11px] rounded-[11px] border p-[11px] text-left transition hover:border-[#dcd2ba]"
                        style={{
                          borderColor: best ? 'rgba(200,168,107,.55)' : '#EDEDEF',
                          background: best ? 'rgba(200,168,107,.06)' : '#ffffff',
                        }}
                      >
                        <span
                          className="grid h-[31px] w-[31px] shrink-0 place-items-center rounded-full text-[10px] font-semibold"
                          style={{
                            background: shades[r.contact.id] ?? brandColor,
                            color: contrastInk(shades[r.contact.id] ?? brandColor),
                          }}
                        >
                          {monogram(r.contact.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-[7px]">
                            <b className="text-[12px] font-medium text-[#1C1C1E]">{r.contact.name || 'Unnamed contact'}</b>
                            <i className="h-[5px] w-[5px] rounded-full" style={{ background: meta.color }} />
                            <span className="text-[10px]" style={{ color: meta.color }}>{meta.label}</span>
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[#6f7370]">{r.contact.role || 'No role recorded'}</span>
                          <span className="mt-1 block text-[10.5px] leading-[1.5] text-[#8e9189]">
                            {r.reasons[0] ?? r.cautions[0] ?? 'Nothing recorded about this relationship yet.'}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-[#a9a294]">{best ? 'BEST' : String(i + 1)}</span>
                      </button>
                    )
                  })}
                  <p className="mt-1 text-[10.5px] leading-[1.55] text-[#9a9d97]">
                    {empty
                      ? 'Nothing is listed because nothing has been added. Director has no connector that could fill this in.'
                      : 'Director ranks these on whether they can be reached at all, department fit, and reply history. You can always choose another person.'}
                  </p>
                  <button
                    onClick={add}
                    className="mt-3 rounded-lg border border-[#E5E5E7] bg-white px-3 py-2 text-[11.5px] text-[#4a4d48] transition hover:border-[#dcd2ba] hover:text-[#1C1C1E]"
                  >
                    + Add a contact
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- bits --- */

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="rounded-lg border px-[11px] py-[7px] text-[11px]"
      style={{
        borderColor: on ? 'rgba(200,168,107,.5)' : '#E5E5E7',
        background: on ? 'rgba(200,168,107,.09)' : '#ffffff',
        color: on ? '#8f6d33' : '#4a4d48',
      }}
    >
      {children}
    </button>
  )
}

function Legend({ color, dashed, children }: { color: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <i
        className="h-[2px] w-[14px] rounded-[2px]"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)`
            : color,
        }}
      />
      {children}
    </span>
  )
}

function Field({ k, v, src, tone }: { k: string; v: string; src: string; tone?: 'faint' | 'bad' }) {
  return (
    <div className="flex items-baseline gap-2.5 border-b border-[#F4F4F6] px-3 py-[9px] last:border-b-0">
      <span className="w-[104px] shrink-0 text-[10.5px] text-[#8e9189]">{k}</span>
      <span
        className="min-w-0 flex-1 text-[11.5px]"
        style={{ color: tone === 'bad' ? '#a05f57' : tone === 'faint' ? '#9a9d97' : '#3a3a3c' }}
      >
        {v}
      </span>
      <span
        className="shrink-0 rounded-full border px-[7px] py-0.5 text-[9px]"
        style={{
          borderColor: tone === 'bad' ? 'rgba(160,95,87,.35)' : '#E9E9EB',
          color: tone === 'bad' ? '#a05f57' : '#6f7370',
        }}
      >
        {src}
      </span>
    </div>
  )
}

/**
 * The selected person.
 *
 * Every row carries where its value came from, because that is the only honest
 * way to show a contact list nobody's connector filled in. A blank field stays
 * blank and says "not on file" — it is never softened into a guess.
 *
 * The action list is short for the same reason. Director has no Gmail, LinkedIn
 * or Instagram connection, so it cannot send anything; it can put the address on
 * your clipboard, open the profile, and record that you sent it yourself.
 */
function SelectedContact({
  contact, brandName, shade, isRecipient, isCc, duplicate, editing,
  onToggleEdit, onPatch, onChoose, onToggleCc, draft, onDraft, onAddNote, loaded,
}: {
  contact: Contact
  brandName: string
  shade: string
  isRecipient: boolean
  isCc: boolean
  duplicate: { contact: Contact; certain: boolean } | null
  editing: boolean
  onToggleEdit: () => void
  onPatch: (p: Partial<Contact>) => void
  onChoose: (ch: Channel) => void
  onToggleCc: () => void
  draft: string
  onDraft: (v: string) => void
  onAddNote: () => void
  loaded: { k: string; v: string }[]
}) {
  const status = contactStatus(contact)
  const meta = STATUS_META[status]
  const routes = availableChannels(contact)
  const notes = noteLines(contact.notes)

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${what} copied.`)
    } catch {
      toast.error('Could not reach the clipboard.')
    }
  }

  const alert =
    status === 'invalid'
      ? {
          title: contact.replyState === 'Bounced' ? 'A message to this address bounced.' : `Marked “${contact.state}”.`,
          text: 'Kept as relationship history and left out of recommendations. Change the status on the card if that is wrong.',
          color: '#a05f57', bg: 'rgba(160,95,87,.06)', border: 'rgba(160,95,87,.32)',
        }
      : !hasAnyRoute(contact)
        ? {
            title: 'No way to reach them yet.',
            text: 'No email, LinkedIn or Instagram is recorded, so this person cannot be pitched. Add a route before choosing them.',
            color: '#8f6d33', bg: 'rgba(200,168,107,.08)', border: 'rgba(200,168,107,.45)',
          }
        : contact.confidence === 'Unverified'
          ? {
              title: 'Details are unverified.',
              text: 'You marked these details unconfirmed. Check them before you send, or use this person as a backup rather than the primary recipient.',
              color: '#8f6d33', bg: 'rgba(200,168,107,.08)', border: 'rgba(200,168,107,.45)',
            }
          : null

  const notOnFile = (v: string) => v.trim() === ''
  const field = (k: string, v: string, src: string) =>
    notOnFile(v)
      ? { k, v: 'Not on file', src: '—', tone: 'faint' as const }
      : { k, v, src, tone: undefined }

  return (
    <div className="animate-[fade-in_.3s_cubic-bezier(.16,1,.3,1)]">
      <div className="flex items-start gap-3 border-t border-[#EDEDEF] pt-4">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[13px] font-semibold"
          style={{
            background: shade,
            color: contrastInk(shade),
            border: `1px solid ${status === 'invalid' ? 'rgba(160,95,87,.5)' : 'rgba(200,168,107,.7)'}`,
          }}
        >
          {monogram(contact.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[7px] text-[9px] font-semibold uppercase tracking-[1.2px] text-[#8e9189]">
            <span>{contact.department || 'Unassigned'}</span>
            <span className="text-[#dcdcde]">·</span>
            <span style={{ color: meta.color }}>{meta.label}</span>
          </div>
          <h2 className="mt-[3px] font-display text-[18px] tracking-[-0.2px] text-[#1C1C1E]">
            {contact.name || 'Unnamed contact'}
          </h2>
          <div className="mt-[3px] text-[12px] text-[#6f7370]">
            {contact.role || 'No role recorded'} · {brandName}
          </div>
        </div>
        <button onClick={onToggleEdit} className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-[#8d908b] hover:text-[#1C1C1E]">
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {duplicate && (
        <p className="mt-3 rounded-md bg-[#FBF7EF] px-2.5 py-1.5 text-[11px] text-[#8f6d33]">
          {duplicate.certain
            ? `${duplicate.contact.name || 'Another record'} already has this email address.`
            : `There is already a ${duplicate.contact.name} here — check this is not the same person.`}
        </p>
      )}

      {alert && (
        <div className="mt-[13px] rounded-[11px] border p-3" style={{ borderColor: alert.border, background: alert.bg }}>
          <div className="text-[11.5px] font-medium" style={{ color: alert.color }}>{alert.title}</div>
          <p className="mt-[5px] text-[11.5px] leading-[1.5] text-[#4a4d48]">{alert.text}</p>
        </div>
      )}

      {editing ? (
        <ContactForm contact={contact} onPatch={onPatch} />
      ) : (
        <div className="mt-3.5 overflow-hidden rounded-xl border border-[#EDEDEF]">
          {[
            field('Work email', contact.email, contact.source),
            field('Phone', contact.phone, contact.source),
            field('LinkedIn', contact.linkedin, contact.source),
            field('Instagram', contact.instagram, contact.source),
            field('Location', contact.location, contact.source),
            { k: 'Seniority', v: contact.seniority, src: contact.source, tone: contact.seniority === 'Unknown' ? ('faint' as const) : undefined },
            { k: 'Preferred channel', v: preferredRoute(contact) ?? 'None recorded', src: contact.preferredChannel ? 'stated' : 'derived', tone: preferredRoute(contact) ? undefined : ('faint' as const) },
            { k: 'Relationship', v: contact.strength, src: 'your log', tone: undefined },
            { k: 'Reply', v: contact.replyState, src: 'your log', tone: contact.replyState === 'Bounced' ? ('bad' as const) : undefined },
            { k: 'Last contacted', v: contact.lastContactedAt || 'Never', src: 'your log', tone: contact.lastContactedAt ? undefined : ('faint' as const) },
            { k: 'Confidence', v: contact.confidence, src: contact.source, tone: contact.confidence === 'Unverified' ? ('faint' as const) : undefined },
          ].map((f) => <Field key={f.k} {...f} />)}
        </div>
      )}

      {/* ------------------------------------------------------------ notes --- */}
      <div className="mt-3.5">
        <div className={`${EYEBROW} mb-2.5`}>RELATIONSHIP NOTES</div>
        {notes.length === 0 && <p className="pb-1 text-[11.5px] text-[#9a9d97]">Nothing logged yet.</p>}
        {notes.map((n, i) => (
          <div key={`${n.when}-${i}`} className="flex gap-2.5 border-b border-[#F4F4F6] py-1.5">
            <span className="w-[78px] shrink-0 font-mono text-[10px] text-[#a9aba5]">{n.when}</span>
            <span className="min-w-0 flex-1 text-[11.5px] leading-[1.5] text-[#4a4d48]">{n.text}</span>
          </div>
        ))}
        <div className="mt-[11px] flex gap-2">
          <input
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onAddNote() }}
            placeholder="Add a note or log a conversation…"
            aria-label="Add note"
            className="min-w-0 flex-1 rounded-lg border border-[#E5E5E7] bg-white px-[11px] py-2 text-[11.5px] text-[#1C1C1E] outline-none focus:border-[#C8A86B]"
          />
          <button
            onClick={onAddNote}
            className="shrink-0 rounded-lg border border-[#E5E5E7] bg-[#F7F7F5] px-3 py-2 text-[11.5px] text-[#4a4d48]"
          >
            Add
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------- actions --- */}
      <div className="mt-[18px]">
        <div className={`${EYEBROW} mb-2.5`}>CONTACT ACTIONS</div>
        <div className="flex flex-wrap gap-[7px]">
          {contact.email.trim() && (
            <Action onClick={() => copy(contact.email, 'Email')}>Copy email</Action>
          )}
          {contact.phone.trim() && (
            <Action onClick={() => copy(contact.phone, 'Phone number')}>Copy phone</Action>
          )}
          {contact.linkedin.trim() && (
            <Action
              href={contact.linkedin.startsWith('http')
                ? contact.linkedin
                : `https://www.linkedin.com/${contact.linkedin.replace(/^\/+/, '')}`}
            >
              Open LinkedIn <ExternalLink size={10} />
            </Action>
          )}
          {contact.instagram.trim() && (
            <Action href={`https://instagram.com/${contact.instagram.replace(/^@/, '')}`}>
              Open Instagram <ExternalLink size={10} />
            </Action>
          )}
          <Action
            onClick={() => {
              onPatch({ lastContactedAt: new Date().toISOString().slice(0, 10), strength: contact.strength === 'Not contacted' ? 'Contacted' : contact.strength })
              toast.success('Marked as sent. Nothing was sent for you — this only records that you did.')
            }}
          >
            Mark as sent
          </Action>
          <Action tone="danger" onClick={() => onPatch({ state: 'Incorrect' })}>Mark as incorrect</Action>
          <Action tone="danger" onClick={() => onPatch({ state: 'Left company' })}>Mark as left company</Action>
        </div>
        <p className="mt-2.5 rounded-[9px] border border-[#EDEDEF] bg-[#FCFCFB] px-[11px] py-2.5 text-[10.5px] leading-[1.55] text-[#8e9189]">
          Gmail, LinkedIn and Instagram are not connected — there is no connector behind this page — so Director
          cannot send for you. Copy the message, open the profile, then mark it as sent. Nothing is recorded as
          sent until you say so.
        </p>
      </div>

      {/* ------------------------------------------------------------ roles --- */}
      <div className="mt-[18px]">
        <div className={`${EYEBROW} mb-2.5`}>ROLE ON THIS PITCH</div>
        {routes.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[#E5DFD1] px-3 py-2.5 text-[11px] leading-[1.5] text-[#8d908b]">
            Add an email, LinkedIn or Instagram before this person can be the recipient.
          </p>
        ) : (
          <>
            <div className="mb-2 text-[10.5px] text-[#8e9189]">Send the pitch to them on:</div>
            <div className="flex flex-wrap gap-1.5">
              {routes.map((ch) => (
                <button
                  key={ch}
                  onClick={() => onChoose(ch)}
                  className="rounded-full border px-2.5 py-1 text-[11.5px] transition"
                  style={{
                    borderColor: isRecipient ? 'rgba(200,168,107,.6)' : '#E5E5E7',
                    background: isRecipient ? 'rgba(200,168,107,.1)' : '#ffffff',
                    color: isRecipient ? '#7d5f2c' : '#6f7370',
                  }}
                >
                  {ch}
                </button>
              ))}
            </div>
            <button
              onClick={onToggleCc}
              className="mt-2 rounded-[10px] border px-[11px] py-[9px] text-left text-[11px] transition"
              style={{
                borderColor: isCc ? 'rgba(200,168,107,.6)' : '#EDEDEF',
                background: isCc ? 'rgba(200,168,107,.08)' : '#ffffff',
                color: isCc ? '#7d5f2c' : '#1C1C1E',
              }}
            >
              {isCc ? 'On CC for this pitch' : 'Add as a CC contact'}
            </button>
          </>
        )}
      </div>

      {/* ---------------------------------------------- loaded into pitch --- */}
      {loaded.length > 0 && (
        <div className="mt-[18px] rounded-xl border border-[#EDEDEF] bg-[#FCFCFB] p-[13px]">
          <div className={`${EYEBROW} mb-2.5`}>LOADED INTO THE PITCH</div>
          {loaded.map((l) => (
            <div key={l.k} className="flex items-baseline gap-2.5 py-1 text-[11.5px]">
              <span className="w-[104px] shrink-0 text-[#8e9189]">{l.k}</span>
              <span className="min-w-0 flex-1 text-[#3a3a3c]">{l.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Action({
  children, onClick, href, tone,
}: {
  children: React.ReactNode
  onClick?: () => void
  href?: string
  tone?: 'danger'
}) {
  const style = {
    borderColor: tone === 'danger' ? 'rgba(160,95,87,.35)' : '#E5E5E7',
    color: tone === 'danger' ? '#a05f57' : '#4a4d48',
  }
  const cls = 'flex items-center gap-1 rounded-lg border bg-white px-[11px] py-[7px] text-[11px] transition hover:border-[#dcd2ba]'
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>{children}</a>
  ) : (
    <button onClick={onClick} className={cls} style={style}>{children}</button>
  )
}

/**
 * Editing a contact.
 *
 * Placeholders are worded to discourage the one mistake that actually costs
 * money — typing a plausible-looking address you have not seen. Every field can
 * stay empty, and the source and confidence selectors are first-class rather
 * than buried, because what a record is worth depends on where it came from.
 */
function ContactForm({ contact, onPatch }: { contact: Contact; onPatch: (p: Partial<Contact>) => void }) {
  const input =
    'w-full rounded-md border border-[#E5E5E7] bg-white px-2.5 py-1.5 text-[11.5px] text-[#1C1C1E] outline-none focus:border-[#C8A86B]'
  const lbl = 'mb-1 block text-[9.5px] font-semibold uppercase tracking-[1.2px] text-[#9a9d97]'

  return (
    <div className="mt-3.5 rounded-xl border border-[#EDEDEF] p-3">
      <div className="mb-2.5">
        <span className={lbl}>Name</span>
        <input value={contact.name} onChange={(e) => onPatch({ name: e.target.value })} className={input} placeholder="Priya Sharma" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="mb-2.5">
          <span className={lbl}>Job title</span>
          <input value={contact.role} onChange={(e) => onPatch({ role: e.target.value })} className={input} placeholder="Partnerships Manager" />
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Department</span>
          <select value={contact.department} onChange={(e) => onPatch({ department: e.target.value as Contact['department'] })} className={input}>
            <option value="">Not known</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Seniority</span>
          <select value={contact.seniority} onChange={(e) => onPatch({ seniority: e.target.value as Contact['seniority'] })} className={input}>
            {SENIORITIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Preferred channel</span>
          <select value={contact.preferredChannel} onChange={(e) => onPatch({ preferredChannel: e.target.value as Channel | '' })} className={input}>
            <option value="">Not known</option>
            {CHANNELS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div className="mb-2.5">
        <span className={lbl}>Email</span>
        <input value={contact.email} onChange={(e) => onPatch({ email: e.target.value })} className={input} placeholder="Only if you actually have it" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="mb-2.5">
          <span className={lbl}>LinkedIn</span>
          <input value={contact.linkedin} onChange={(e) => onPatch({ linkedin: e.target.value })} className={input} placeholder="in/priya" />
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Instagram</span>
          <input value={contact.instagram} onChange={(e) => onPatch({ instagram: e.target.value })} className={input} placeholder="@priya" />
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Phone</span>
          <input value={contact.phone} onChange={(e) => onPatch({ phone: e.target.value })} className={input} />
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Location</span>
          <input value={contact.location} onChange={(e) => onPatch({ location: e.target.value })} className={input} placeholder="Mumbai" />
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Where this came from</span>
          <select value={contact.source} onChange={(e) => onPatch({ source: e.target.value as Contact['source'] })} className={input}>
            {CONTACT_SOURCES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Confidence</span>
          <select value={contact.confidence} onChange={(e) => onPatch({ confidence: e.target.value as Contact['confidence'] })} className={input}>
            {CONFIDENCES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Relationship</span>
          <select value={contact.strength} onChange={(e) => onPatch({ strength: e.target.value as Contact['strength'] })} className={input}>
            {STRENGTHS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Reply</span>
          <select value={contact.replyState} onChange={(e) => onPatch({ replyState: e.target.value as Contact['replyState'] })} className={input}>
            {REPLY_STATES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="mb-2.5">
          <span className={lbl}>Status</span>
          <select value={contact.state} onChange={(e) => onPatch({ state: e.target.value as Contact['state'] })} className={input}>
            {CONTACT_STATES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
