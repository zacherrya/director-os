import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import {
  TYPE_LABEL,
  findDuplicate,
  groupByDepartment,
  hasAnyRoute,
  recommendContacts,
  type Contact,
} from '../lib/contacts'
import { nucleusLayout } from '../lib/nucleus'
import { contrastInk, shadesOf } from '../lib/brandColor'
import type { Channel } from '../lib/partnerships'
import { ContactCard } from '../components/partnerships/ContactCard'
import { toast } from '../lib/toast'
import { Check, ChevronLeft, Plus, Search } from '../components/Icon'

/**
 * Contact Nucleus — a whole page now, because choosing who to send a pitch to is
 * its own piece of work rather than a footnote at the bottom of the pitch panel.
 *
 * The provenance rule from `lib/contacts` is the reason this page looks so empty
 * on a new brand. Director has no Gmail, LinkedIn or Instagram connector, so it
 * cannot read a company's staff list, and it will not draw a sphere for a person
 * it invented. Every node here was typed in by the user. The empty state says so
 * rather than spinning a loader over nothing.
 *
 * The diagram carries exactly one meaning — distance from the nucleus is
 * relevance to this deal — and the recommendation always shows its doubts next
 * to its reasons. Anyone can be picked regardless of where they sit.
 */

/** When a brand has no colour set, the nucleus falls back to the product's own
 * gold rather than inventing an identity for someone else's company. */
const FALLBACK = '#C8A86B'

const eyebrow = 'text-[10px] font-semibold uppercase tracking-[1.3px] text-[#8e9189]'

/** Room for the department labels either side, and for the name under the
 * lowest sphere. */
const PAD_X = 146
const PAD_TOP = 22
const PAD_BOTTOM = 34

const monogram = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

export function ContactNucleusPage() {
  const { opportunityId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const opportunities = useAppStore((s) => s.opportunities)
  const brands = useAppStore((s) => s.brands)
  const contacts = useAppStore((s) => s.contacts)
  const createContact = useAppStore((s) => s.createContact)
  const updateOpportunity = useAppStore((s) => s.updateOpportunity)

  const [openId, setOpenId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const opportunity = opportunities.find((o) => o.id === opportunityId && !o.deletedAt)
  const brand = brands.find((b) => b.id === opportunity?.brandId)

  const mine = useMemo(
    () => contacts.filter((c) => !c.deletedAt && c.brandId === opportunity?.brandId),
    [contacts, opportunity?.brandId],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return mine
    return mine.filter((c) => `${c.name} ${c.role} ${c.department}`.toLowerCase().includes(q))
  }, [mine, query])

  const type = opportunity?.type ?? 'unsure'
  const ranked = useMemo(() => recommendContacts(filtered, type), [filtered, type])
  const groups = useMemo(() => groupByDepartment(filtered, type), [filtered, type])
  const geometry = useMemo(() => nucleusLayout(groups), [groups])

  /**
   * One shade per person, off the brand's own colour, deepest first in ranked
   * order. Two things fall out of that: neighbouring spheres are always visibly
   * different, and the person Director would pick is the one the eye lands on.
   * The nucleus keeps the brand colour itself and is never a shade of it.
   */
  const shadeOf = useMemo(() => {
    const base = brand?.color || FALLBACK
    // shadesOf runs light to dark; the strongest candidate wants the darkest.
    const ladder = shadesOf(base, Math.max(ranked.length, 1)).reverse()
    const map = new Map<string, string>()
    ranked.forEach((r, i) => map.set(r.contact.id, ladder[i] ?? base))
    return (id: string) => map.get(id) ?? base
  }, [brand?.color, ranked])

  const byId = useMemo(() => new Map(mine.map((c) => [c.id, c])), [mine])
  const top = ranked[0]
  const opened = openId ? byId.get(openId) : undefined
  const recipient = mine.find((c) => c.id === opportunity?.recipientContactId)

  // Deleting or filtering away the open contact should close the card, not leave
  // a detail pane pointing at nothing.
  useEffect(() => {
    if (openId && !byId.has(openId)) setOpenId(null)
  }, [openId, byId])

  // Opening someone from the diagram — or landing on a contact just created from
  // the pitch panel — must not leave their card somewhere down an unscrolled
  // rail. Measured a frame later, once the expanded card has been laid out, and
  // left alone when the row is already sitting comfortably in view.
  const railRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!openId) return
    const frame = requestAnimationFrame(() => {
      const rail = railRef.current
      const row = document.getElementById(`nucleus-contact-${openId}`)
      if (!rail || !row) return
      const r = row.getBoundingClientRect()
      const c = rail.getBoundingClientRect()
      // Bring the row to the top of the rail rather than merely into view: the
      // card opens *below* the row, so a row scrolled just inside the bottom
      // edge would leave every field of it hidden. Jumping rather than gliding,
      // because arriving from the pitch panel re-renders the list a beat later
      // and that cancels a smooth scroll halfway.
      rail.scrollTo({ top: rail.scrollTop + (r.top - c.top) - 12 })
    })
    return () => cancelAnimationFrame(frame)
  }, [openId])

  // Arriving from the pitch panel's "Add a contact" should land on an open,
  // empty card rather than on a diagram the user then has to hunt through.
  const wantsNew = params.get('add') === '1'
  // One blank contact per arrival, not one per effect run: this fires under
  // StrictMode's double-invoke too, and a stray second empty record is a real
  // duplicate the user then has to find and delete.
  const added = useRef(false)
  useEffect(() => {
    if (!wantsNew || !opportunity || added.current) return
    added.current = true
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.delete('add')
      return next
    }, { replace: true })
    const c = createContact(opportunity.brandId)
    setOpenId(c.id)
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

  function add() {
    const c = createContact(opportunity!.brandId)
    setOpenId(c.id)
    setQuery('')
  }

  function selectRecipient(contact: Contact, channel: Channel) {
    updateOpportunity(opportunity!.id, { recipientContactId: contact.id, recipientChannel: channel })
    toast.success(`Pitch addressed to ${contact.name || 'this contact'} on ${channel}.`)
  }

  /** Warns before a second record for someone already here. */
  function duplicateNote(c: Contact) {
    const dup = findDuplicate(c, mine.filter((x) => x.id !== c.id))
    if (!dup) return null
    return dup.certain
      ? `${dup.contact.name || 'Another record'} already has this email address.`
      : `There is already a ${dup.contact.name} here — check this is not the same person.`
  }

  const nucleusColor = brand?.color || FALLBACK

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* ---------------------------------------------------------- header --- */}
      <header className="flex shrink-0 items-start gap-4 border-b border-[#EDEDEF] px-9 py-5">
        <button
          onClick={() => navigate(`/partnerships?open=${opportunity.id}`)}
          aria-label="Back to the pitch"
          className="mt-1 shrink-0 rounded-lg bg-transparent p-1.5 text-[#9a9d97] transition hover:bg-[#F7F7F5] hover:text-[#1C1C1E]"
        >
          <ChevronLeft size={16} />
        </button>
        <div
          className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg border text-[12px] font-semibold"
          style={{ backgroundColor: nucleusColor, borderColor: nucleusColor, color: contrastInk(nucleusColor) }}
        >
          {monogram(brand?.name ?? '??')}
        </div>
        <div className="min-w-0 flex-1">
          <div className={eyebrow}>Contact Nucleus</div>
          <h1 className="mt-1 truncate font-display text-[22px] tracking-tight text-[#1C1C1E]">
            {brand?.name ?? 'Unknown brand'}
          </h1>
          <p className="mt-0.5 text-[12px] text-[#6f7370]">
            Who to send {opportunity.title ? `“${opportunity.title}”` : 'this pitch'} to, and why them ·{' '}
            {TYPE_LABEL[opportunity.type]}
          </p>
        </div>
        <button
          onClick={add}
          className="mt-1 flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1C1C1E] px-3.5 py-2 text-[12.5px] font-medium text-white transition hover:bg-[#33333a]"
        >
          <Plus size={14} strokeWidth={2} />
          Add a contact
        </button>
      </header>

      {mine.length === 0 ? (
        /* ------------------------------------------------------- empty --- */
        <div className="grid min-h-0 flex-1 place-items-center px-9">
          <div className="max-w-[420px] text-center">
            <div
              className="mx-auto h-[74px] w-[74px] rounded-full"
              style={{
                backgroundColor: nucleusColor,
                // Nothing orbits it yet, so the halo stands in for the people
                // who are not there.
                boxShadow: `0 0 0 12px ${nucleusColor}1f, 0 0 0 26px ${nucleusColor}12`,
              }}
            />
            <p className="mt-7 text-[14px] font-medium text-[#1C1C1E]">
              No contacts for {brand?.name ?? 'this brand'} yet
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#8d908b]">
              Director cannot read a company's staff list — there is no Gmail, LinkedIn or Instagram
              connection behind this page — so nothing appears here until you add it. Add the person you
              found on LinkedIn, the address on their press page, or whoever replied to your last DM.
            </p>
            <button
              onClick={add}
              className="mt-5 rounded-lg bg-[#1C1C1E] px-4 py-2 text-[12.5px] font-medium text-white transition hover:bg-[#33333a]"
            >
              Add the first contact
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ------------------------------------------------------ diagram --- */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-9 py-6">
            {recipient && (
              <div className="mb-5 flex items-start gap-2 self-start rounded-lg border border-[#C8A86B]/50 bg-[#FBF7EF] px-3 py-2">
                <Check size={12} style={{ color: '#8f6d33', marginTop: 2, flexShrink: 0 }} />
                <div className="text-[11.5px] leading-relaxed text-[#1C1C1E]">
                  Pitch addressed to <b>{recipient.name || 'a contact'}</b>
                  {recipient.role ? `, ${recipient.role}` : ''} on {opportunity.recipientChannel}.
                </div>
              </div>
            )}

            <div className="mx-auto w-full max-w-[660px]">
              {/* Department labels sit outside the outer ring and the longest of
                  them ("Influencer Marketing") runs well past it, so the viewBox
                  is padded rather than the rings pulled in — shrinking the rings
                  would crowd the spheres to fit the text. */}
              <svg
                viewBox={`${-PAD_X} ${-PAD_TOP} ${geometry.size + PAD_X * 2} ${geometry.size + PAD_TOP + PAD_BOTTOM}`}
                className="h-auto w-full"
                role="img"
                aria-label={`${mine.length} contacts at ${brand?.name ?? 'this brand'}, arranged by department`}
              >
                {geometry.ringRadii.map((r, i) => (
                  <circle
                    key={i}
                    cx={geometry.centre}
                    cy={geometry.centre}
                    r={r}
                    fill="none"
                    stroke="#EDEDEF"
                    strokeDasharray={i === 0 ? undefined : '3 5'}
                  />
                ))}

                {geometry.departments.map((d) => {
                  // Clear both the sphere and the name printed under it, so a
                  // department label never collides with one of its own people.
                  const rad = (d.angle * Math.PI) / 180
                  const push = geometry.ringRadii[d.ring] + 48
                  const x = geometry.centre + push * Math.cos(rad)
                  const y = geometry.centre + push * Math.sin(rad)
                  return (
                    <text
                      key={`${d.department}-${d.ring}`}
                      x={x}
                      y={y}
                      textAnchor={Math.abs(Math.cos(rad)) < 0.25 ? 'middle' : Math.cos(rad) > 0 ? 'start' : 'end'}
                      dominantBaseline="middle"
                      fontSize="9"
                      fontWeight="600"
                      letterSpacing="0.9"
                      fill={d.relevant ? '#8f6d33' : '#b3b6b1'}
                    >
                      {d.department.toUpperCase()}
                    </text>
                  )
                })}

                {/* The nucleus: the brand's own colour, never a shade of it. */}
                <circle
                  cx={geometry.centre}
                  cy={geometry.centre}
                  r={geometry.nucleusRadius}
                  fill={nucleusColor}
                />
                <text
                  x={geometry.centre}
                  y={geometry.centre}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="12"
                  fontWeight="600"
                  fill={contrastInk(nucleusColor)}
                >
                  {monogram(brand?.name ?? '??')}
                </text>

                {geometry.contacts.map((node) => {
                  const c = byId.get(node.contactId)
                  if (!c) return null
                  const fill = shadeOf(c.id)
                  const isRecipient = opportunity.recipientContactId === c.id
                  const isOpen = openId === c.id
                  const active = isOpen || hoverId === c.id
                  const reachable = hasAnyRoute(c)
                  return (
                    <g
                      key={c.id}
                      onClick={() => setOpenId(isOpen ? null : c.id)}
                      onMouseEnter={() => setHoverId(c.id)}
                      onMouseLeave={() => setHoverId((v) => (v === c.id ? null : v))}
                      style={{ cursor: 'pointer' }}
                      // Contacts are reachable from the list below too; the
                      // diagram is a second route to the same thing.
                      aria-hidden="true"
                    >
                      <line
                        x1={geometry.centre}
                        y1={geometry.centre}
                        x2={node.x}
                        y2={node.y}
                        stroke={fill}
                        strokeWidth={active ? 1.4 : 0.8}
                        opacity={node.ring === 0 ? 0.5 : 0.25}
                      />
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.radius + (active ? 2 : 0)}
                        fill={fill}
                        // Someone with no email, LinkedIn or Instagram cannot be
                        // pitched at all — an outline says so without hiding them.
                        fillOpacity={reachable ? (node.ring === 0 ? 1 : 0.55) : 0.16}
                        stroke={isRecipient ? '#8f6d33' : reachable ? 'none' : fill}
                        strokeWidth={isRecipient ? 2 : 1.2}
                        strokeDasharray={!reachable && !isRecipient ? '2 2' : undefined}
                      />
                      <text
                        x={node.x}
                        y={node.y + node.radius + 11}
                        textAnchor="middle"
                        fontSize="8.5"
                        fill={active ? '#1C1C1E' : '#8d908b'}
                      >
                        {(c.name || 'Unnamed').split(/\s+/)[0]}
                      </text>
                    </g>
                  )
                })}
              </svg>

              <p className="mt-3 text-center text-[10.5px] leading-relaxed text-[#9a9d97]">
                Spheres are shades of {brand?.name ?? 'the brand'}'s colour, deepest for whoever Director
                ranks highest. The inner ring is the right desk for {TYPE_LABEL[opportunity.type]}; a dashed
                outline means there is no way to reach them yet.
              </p>
            </div>
          </div>

          {/* --------------------------------------------------------- rail --- */}
          <aside
            ref={railRef}
            className="flex w-[380px] max-w-[45%] shrink-0 flex-col overflow-y-auto border-l border-[#EDEDEF] bg-[#FCFCFB] px-5 py-5"
          >
            {top && (
              <div className="rounded-xl border border-[#E5E5E7] bg-white p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={eyebrow}>Director recommends</span>
                  <span className="text-[10.5px] text-[#9a9d97]">for {TYPE_LABEL[opportunity.type]}</span>
                </div>
                <button
                  onClick={() => setOpenId(top.contact.id)}
                  className="mt-1.5 flex w-full items-center gap-2 rounded-lg bg-transparent text-left"
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{ backgroundColor: shadeOf(top.contact.id) }}
                  />
                  <span className="text-[13px] font-semibold text-[#1C1C1E]">
                    {top.contact.name || 'Unnamed contact'}
                    {top.contact.role ? (
                      <span className="font-normal text-[#6f7370]"> · {top.contact.role}</span>
                    ) : null}
                  </span>
                </button>
                {top.reasons.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {top.reasons.map((r) => (
                      <li key={r} className="text-[11px] leading-relaxed text-[#4a4d49]">— {r}</li>
                    ))}
                  </ul>
                )}
                {top.cautions.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-[#F2F2F4] pt-1.5">
                    {top.cautions.map((r) => (
                      <li key={r} className="text-[11px] leading-relaxed text-[#a05f57]">— {r}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[10.5px] text-[#9a9d97]">Pick anyone else below — this is a suggestion.</p>
              </div>
            )}

            <div className="relative mt-4">
              <Search
                size={13}
                style={{ position: 'absolute', left: 9, top: 8, color: '#9a9d97', pointerEvents: 'none' }}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts"
                aria-label="Search contacts"
                className="w-full rounded-md border border-[#E5E5E7] bg-white py-1.5 pl-7 pr-2.5 text-[12px] text-[#1C1C1E] outline-none focus:border-[#C8A86B]"
              />
            </div>

            {filtered.length === 0 && (
              <p className="mt-3 text-[11.5px] text-[#8d908b]">No one here matches “{query.trim()}”.</p>
            )}

            <div className="mt-3 flex flex-col gap-3 pb-3">
              {groups.map((g) => (
                <div key={String(g.department)}>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-[1.2px]"
                      style={{ color: g.relevant ? '#8f6d33' : '#b3b6b1' }}
                    >
                      {g.department}
                    </span>
                    {g.relevant && <span className="text-[10px] text-[#9a9d97]">right desk for this deal</span>}
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {g.contacts.map((c) => {
                      const isOpen = openId === c.id
                      const isRecipient = opportunity.recipientContactId === c.id
                      const note = duplicateNote(c)
                      return (
                        <div key={c.id} id={`nucleus-contact-${c.id}`}>
                          <button
                            onClick={() => setOpenId(isOpen ? null : c.id)}
                            onMouseEnter={() => setHoverId(c.id)}
                            onMouseLeave={() => setHoverId((v) => (v === c.id ? null : v))}
                            aria-expanded={isOpen}
                            className="flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition"
                            style={{
                              borderColor: isRecipient ? '#C8A86B' : '#E5E5E7',
                              backgroundColor: isRecipient ? '#FBF7EF' : '#FFFFFF',
                              opacity: g.relevant || isRecipient ? 1 : 0.62,
                            }}
                          >
                            <span
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold"
                              style={{
                                backgroundColor: shadeOf(c.id),
                                color: contrastInk(shadeOf(c.id)),
                              }}
                            >
                              {monogram(c.name)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] text-[#1C1C1E]">
                                {c.name || 'Unnamed contact'}
                              </span>
                              <span className="block truncate text-[10.5px] text-[#8d908b]">
                                {c.role || 'No role recorded'} · {c.strength.toLowerCase()}
                              </span>
                            </span>
                          </button>
                          {isOpen && opened && (
                            <div className="mt-1.5">
                              {note && (
                                <p className="mb-1.5 rounded-md bg-[#FBF7EF] px-2.5 py-1.5 text-[11px] text-[#8f6d33]">
                                  {note}
                                </p>
                              )}
                              <ContactCard
                                contact={opened}
                                isRecipient={isRecipient}
                                onSelectRecipient={(ch) => selectRecipient(opened, ch)}
                                onClose={() => setOpenId(null)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={add}
              className="mt-auto flex items-center gap-1.5 rounded-md bg-transparent px-1 py-1 text-[11.5px] font-medium text-[#6f7370] transition hover:text-[#1C1C1E]"
            >
              <Plus size={12} />
              Add a contact
            </button>
          </aside>
        </div>
      )}
    </div>
  )
}
