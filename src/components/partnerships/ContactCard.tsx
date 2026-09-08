import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import {
  CONFIDENCES, CONTACT_SOURCES, CONTACT_STATES, DEPARTMENTS, REPLY_STATES, SENIORITIES, STRENGTHS,
  availableChannels, type Contact,
} from '../../lib/contacts'
import { CHANNELS, type Channel } from '../../lib/partnerships'
import { toast } from '../../lib/toast'
import { Check, ExternalLink, Trash2 } from '../Icon'

/**
 * Everything on this card was typed in by the user or imported from something
 * they can see, and the source line says which. Director has no connector that
 * can read a company's staff list, so a field left blank stays blank — an
 * invented address costs a fortnight of silence before anyone notices.
 */

const field = 'w-full rounded-md border border-[#E5E5E7] bg-white px-2.5 py-1.5 text-[12px] text-[#1C1C1E] outline-none focus:border-[#C8A86B]'
const label = 'mb-1 block text-[9.5px] font-semibold uppercase tracking-[1.2px] text-[#9a9d97]'

function Line({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5">{children}</div>
}

export function ContactCard({
  contact,
  isRecipient,
  onSelectRecipient,
  onClose,
}: {
  contact: Contact
  isRecipient: boolean
  onSelectRecipient: (channel: Channel) => void
  onClose: () => void
}) {
  const updateContact = useAppStore((s) => s.updateContact)
  const deleteContact = useAppStore((s) => s.deleteContact)
  const [editing, setEditing] = useState(contact.name.trim() === '')

  const patch = (p: Partial<Contact>) => updateContact(contact.id, p)
  const routes = availableChannels(contact)

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${what} copied.`)
    } catch {
      toast.error('Could not reach the clipboard.')
    }
  }

  return (
    <div className="rounded-xl border border-[#E5E5E7] bg-white p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#1C1C1E]">{contact.name || 'Unnamed contact'}</div>
          <div className="text-[11.5px] text-[#6f7370]">
            {[contact.role, contact.department].filter(Boolean).join(' · ') || 'No role recorded'}
          </div>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="shrink-0 rounded-md bg-transparent px-1.5 py-1 text-[11px] text-[#8d908b] hover:text-[#1C1C1E]"
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {contact.state !== 'Active' && (
        <p className="mt-2 rounded-md bg-[#FBF1EF] px-2.5 py-1.5 text-[11px] text-[#a05f57]">
          Marked “{contact.state}” — left out of recommendations.
        </p>
      )}

      {!editing ? (
        <>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#6f7370]">
            <span>{contact.seniority}</span>
            <span>{contact.strength}</span>
            <span>Reply: {contact.replyState}</span>
            {contact.location && <span>{contact.location}</span>}
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            {contact.email && (
              <button onClick={() => copy(contact.email, 'Email')} className="flex items-center justify-between rounded-md bg-[#FCFBF8] px-2.5 py-1.5 text-left text-[11.5px] text-[#1C1C1E] hover:bg-[#F5F3ED]">
                <span className="truncate font-mono text-[11px]">{contact.email}</span>
                <span className="shrink-0 text-[10.5px] text-[#8d908b]">Copy</span>
              </button>
            )}
            {contact.phone && (
              <button onClick={() => copy(contact.phone, 'Phone number')} className="flex items-center justify-between rounded-md bg-[#FCFBF8] px-2.5 py-1.5 text-left text-[11.5px] text-[#1C1C1E] hover:bg-[#F5F3ED]">
                <span className="truncate font-mono text-[11px]">{contact.phone}</span>
                <span className="shrink-0 text-[10.5px] text-[#8d908b]">Copy</span>
              </button>
            )}
            {contact.linkedin && (
              <a href={contact.linkedin.startsWith('http') ? contact.linkedin : `https://www.linkedin.com/${contact.linkedin.replace(/^\/+/, '')}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-md bg-[#FCFBF8] px-2.5 py-1.5 text-[11.5px] text-[#1C1C1E] hover:bg-[#F5F3ED]">
                <span className="truncate">LinkedIn</span>
                <ExternalLink size={11} />
              </a>
            )}
            {contact.instagram && (
              <a href={`https://instagram.com/${contact.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-md bg-[#FCFBF8] px-2.5 py-1.5 text-[11.5px] text-[#1C1C1E] hover:bg-[#F5F3ED]">
                <span className="truncate">{contact.instagram}</span>
                <ExternalLink size={11} />
              </a>
            )}
            {routes.length === 0 && (
              <p className="rounded-md border border-dashed border-[#E5DFD1] px-2.5 py-2 text-[11px] leading-relaxed text-[#8d908b]">
                No way to reach them yet. Add an email, LinkedIn or Instagram before pitching.
              </p>
            )}
          </div>

          {contact.notes && (
            <p className="mt-2.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-[#4a4d49]">{contact.notes}</p>
          )}

          <p className="mt-3 border-t border-[#F2F2F4] pt-2 text-[10.5px] text-[#9a9d97]">
            {contact.source} · {contact.confidence.toLowerCase()}
            {contact.lastContactedAt ? ` · last contacted ${contact.lastContactedAt}` : ' · never contacted'}
          </p>

          {routes.length > 0 && (
            <div className="mt-3">
              <span className={label}>Use for this pitch</span>
              <div className="flex flex-wrap gap-1.5">
                {routes.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => onSelectRecipient(ch)}
                    className="rounded-full border border-[#E5E5E7] px-2.5 py-1 text-[11.5px] text-[#6f7370] transition hover:border-[#C8A86B] hover:text-[#1C1C1E]"
                  >
                    {ch}
                  </button>
                ))}
              </div>
              {isRecipient && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#5f7d69]">
                  <Check size={11} /> Pitch recipient selected
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3">
          <Line>
            <span className={label}>Name</span>
            <input value={contact.name} onChange={(e) => patch({ name: e.target.value })} className={field} placeholder="Priya Sharma" />
          </Line>
          <div className="grid grid-cols-2 gap-2">
            <Line>
              <span className={label}>Job title</span>
              <input value={contact.role} onChange={(e) => patch({ role: e.target.value })} className={field} placeholder="Partnerships Manager" />
            </Line>
            <Line>
              <span className={label}>Department</span>
              <select value={contact.department} onChange={(e) => patch({ department: e.target.value as Contact['department'] })} className={field}>
                <option value="">Not known</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Line>
            <Line>
              <span className={label}>Seniority</span>
              <select value={contact.seniority} onChange={(e) => patch({ seniority: e.target.value as Contact['seniority'] })} className={field}>
                {SENIORITIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Line>
            <Line>
              <span className={label}>Preferred channel</span>
              <select value={contact.preferredChannel} onChange={(e) => patch({ preferredChannel: e.target.value as Channel | '' })} className={field}>
                <option value="">Not known</option>
                {CHANNELS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Line>
          </div>
          <Line>
            <span className={label}>Email</span>
            <input value={contact.email} onChange={(e) => patch({ email: e.target.value })} className={field} placeholder="Only if you actually have it" />
          </Line>
          <div className="grid grid-cols-2 gap-2">
            <Line>
              <span className={label}>LinkedIn</span>
              <input value={contact.linkedin} onChange={(e) => patch({ linkedin: e.target.value })} className={field} placeholder="in/priya" />
            </Line>
            <Line>
              <span className={label}>Instagram</span>
              <input value={contact.instagram} onChange={(e) => patch({ instagram: e.target.value })} className={field} placeholder="@priya" />
            </Line>
            <Line>
              <span className={label}>Phone</span>
              <input value={contact.phone} onChange={(e) => patch({ phone: e.target.value })} className={field} />
            </Line>
            <Line>
              <span className={label}>Location</span>
              <input value={contact.location} onChange={(e) => patch({ location: e.target.value })} className={field} placeholder="Mumbai" />
            </Line>
            <Line>
              <span className={label}>Where this came from</span>
              <select value={contact.source} onChange={(e) => patch({ source: e.target.value as Contact['source'] })} className={field}>
                {CONTACT_SOURCES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Line>
            <Line>
              <span className={label}>Confidence</span>
              <select value={contact.confidence} onChange={(e) => patch({ confidence: e.target.value as Contact['confidence'] })} className={field}>
                {CONFIDENCES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Line>
            <Line>
              <span className={label}>Relationship</span>
              <select value={contact.strength} onChange={(e) => patch({ strength: e.target.value as Contact['strength'] })} className={field}>
                {STRENGTHS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Line>
            <Line>
              <span className={label}>Reply</span>
              <select value={contact.replyState} onChange={(e) => patch({ replyState: e.target.value as Contact['replyState'] })} className={field}>
                {REPLY_STATES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Line>
          </div>
          <Line>
            <span className={label}>Notes</span>
            <textarea value={contact.notes} onChange={(e) => patch({ notes: e.target.value })} rows={2} className={`${field} resize-none leading-relaxed`} placeholder="How you found them, what they said." />
          </Line>
          <Line>
            <span className={label}>Status</span>
            <select value={contact.state} onChange={(e) => patch({ state: e.target.value as Contact['state'] })} className={field}>
              {CONTACT_STATES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Line>
          <button
            onClick={() => {
              deleteContact(contact.id)
              onClose()
            }}
            className="flex items-center gap-1.5 rounded-md bg-transparent px-1 py-1 text-[11.5px] text-[#8d908b] hover:text-[#a05f57]"
          >
            <Trash2 size={12} />
            Remove this contact
          </button>
        </div>
      )}
    </div>
  )
}
