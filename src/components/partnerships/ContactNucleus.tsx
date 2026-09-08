import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { TYPE_LABEL, recommendContacts } from '../../lib/contacts'
import type { Brand, Opportunity } from '../../lib/partnerships'
import { contrastInk, shadesOf } from '../../lib/brandColor'
import { Check, ChevronRight, Plus } from '../Icon'

/**
 * The pitch panel's doorway into the Contact Nucleus.
 *
 * Choosing who to send a pitch to outgrew a strip at the bottom of this panel,
 * so the network, the diagram and the contact records now live on their own page
 * and this is the summary that leads there. It answers only the two questions
 * worth answering in a panel — is this pitch addressed to anyone yet, and who
 * would Director suggest — and hands off for everything else.
 *
 * Director has no connector that can read a brand's staff list, so the count
 * here is only ever what the user has entered. Nothing is inferred.
 */

const label = 'text-[10px] font-semibold uppercase tracking-[1.3px] text-[#8e9189]'

const monogram = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

export function ContactNucleus({ opportunity, brand }: { opportunity: Opportunity; brand?: Brand }) {
  const contacts = useAppStore((s) => s.contacts)

  const mine = useMemo(
    () => contacts.filter((c) => !c.deletedAt && c.brandId === opportunity.brandId),
    [contacts, opportunity.brandId],
  )
  const ranked = useMemo(() => recommendContacts(mine, opportunity.type), [mine, opportunity.type])
  const top = ranked[0]
  const recipient = mine.find((c) => c.id === opportunity.recipientContactId)

  const base = brand?.color || '#C8A86B'
  // Same ladder the page draws its spheres from — deepest first, in ranked order
  // — so the person named here wears the colour they wear over there.
  const topShade = top ? shadesOf(base, Math.max(ranked.length, 1)).at(-1) ?? base : base

  const nucleusPath = `/partnerships/opportunities/${opportunity.id}/contacts`

  return (
    <div className="mb-6 rounded-xl border border-[#EDEDEF] bg-[#FCFCFB] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={label}>Contact Nucleus</span>
        <span className="text-[10.5px] text-[#9a9d97]">
          {mine.length === 0 ? 'No one yet' : `${mine.length} ${mine.length === 1 ? 'person' : 'people'}`}
        </span>
      </div>

      {recipient ? (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-[#C8A86B]/50 bg-[#FBF7EF] px-3 py-2">
          <Check size={12} style={{ color: '#8f6d33', marginTop: 2, flexShrink: 0 }} />
          <div className="min-w-0 text-[11.5px] leading-relaxed text-[#1C1C1E]">
            Pitch addressed to <b>{recipient.name || 'a contact'}</b>
            {recipient.role ? `, ${recipient.role}` : ''} on {opportunity.recipientChannel}.
          </div>
        </div>
      ) : (
        mine.length > 0 && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-[#8d908b]">
            Your pitch is ready. Now choose the right person.
          </p>
        )
      )}

      {mine.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-[#E5DFD1] px-3 py-4 text-center">
          <p className="text-[12px] font-medium text-[#1C1C1E]">No contacts for {brand?.name ?? 'this brand'} yet</p>
          <p className="mx-auto mt-1.5 max-w-[300px] text-[11px] leading-relaxed text-[#8d908b]">
            Director cannot read a company's staff list, so nothing appears here until you add it. Add the
            person you found on LinkedIn, the address on their press page, or whoever replied to your last DM.
          </p>
          <Link
            to={`${nucleusPath}?add=1`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#1C1C1E] px-3 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-[#33333a]"
          >
            <Plus size={12} />
            Add a contact
          </Link>
        </div>
      ) : (
        <>
          {top && !recipient && (
            <div className="mt-3 rounded-lg border border-[#E5E5E7] bg-white p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className={label}>Director recommends</span>
                <span className="text-[10.5px] text-[#9a9d97]">for {TYPE_LABEL[opportunity.type]}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold"
                  style={{ backgroundColor: topShade, color: contrastInk(topShade) }}
                >
                  {monogram(top.contact.name)}
                </span>
                <span className="min-w-0 text-[12.5px] font-semibold text-[#1C1C1E]">
                  {top.contact.name || 'Unnamed contact'}
                  {top.contact.role ? (
                    <span className="font-normal text-[#6f7370]"> · {top.contact.role}</span>
                  ) : null}
                </span>
              </div>
              <p className="mt-2 text-[10.5px] text-[#9a9d97]">
                Reasons, doubts and everyone else are in the Nucleus.
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Link
              to={nucleusPath}
              className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-[#E5E5E7] bg-white px-3 py-2 text-[11.5px] font-medium text-[#1C1C1E] transition hover:border-[#C8A86B]"
            >
              Open the Nucleus
              <ChevronRight size={13} />
            </Link>
            <Link
              to={`${nucleusPath}?add=1`}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-[11.5px] font-medium text-[#6f7370] transition hover:text-[#1C1C1E]"
            >
              <Plus size={12} />
              Add a contact
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
