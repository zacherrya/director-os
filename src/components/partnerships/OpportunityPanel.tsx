import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import {
  CHANNELS,
  DESTINATIONS,
  STAGES,
  STAGE_COLOR,
  TYPE_INFO,
  VALUE_OFFERED,
  WORLD_HEALTH_COLOR,
  actionState,
  activityEntry,
  channelStates,
  completeAction,
  confirmedValue,
  destinationIndex,
  formatActionDate,
  journeyFor,
  lastContact,
  localDate,
  outcomeOf,
  stageChange,
  worldHealth,
  type Activity,
  type Channel,
  type Opportunity,
} from '../../lib/partnerships'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { BrandColorPicker } from './BrandColorPicker'
import { PitchBuilder } from './PitchBuilder'
import { ContactNucleus } from './ContactNucleus'
import { contrastInk } from '../../lib/brandColor'
import { Icon, Trash2, X } from '../Icon'

const inputClass =
  'w-full rounded-lg border border-[#E5E5E7] bg-white px-3 py-2 text-[13px] text-[#1C1C1E] placeholder:text-[#9a9d97] focus:border-[#C8A86B] focus:outline-none'

const monogram = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0] ?? '')
    .join('')
    .toUpperCase()

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-semibold uppercase tracking-[1.2px] text-[#8e9189]">{children}</div>
  )
}

function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white px-3 py-3">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1.5 text-[12.5px] text-[#1C1C1E]">{children}</div>
    </div>
  )
}

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
                ? 'border-[#C8A86B] bg-[rgba(200,168,107,0.12)] font-medium text-[#8f6d33]'
                : 'border-[#E5E5E7] text-[#6f7370] hover:border-[#b4b7b1] hover:text-[#1C1C1E]'
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

  const [activeChannel, setActiveChannel] = useState<Channel>('Email')
  const [draft, setDraft] = useState('')

  const brand = useMemo(() => brands.find((b) => b.id === opportunity.brandId), [brands, opportunity.brandId])
  const info = TYPE_INFO[opportunity.type]
  const state = actionState(opportunity)
  const destIndex = destinationIndex(opportunity)
  const dest = DESTINATIONS[destIndex]
  const wh = worldHealth(opportunity)
  const healthColor = WORLD_HEALTH_COLOR[wh]
  const outcome = outcomeOf(opportunity)
  const confirmed = confirmedValue(opportunity)
  const channels = channelStates(opportunity)
  const active = channels.find((c) => c.channel === activeChannel) ?? channels[0]
  const journey = journeyFor(opportunity)
  const timeline = [...(opportunity.activity ?? [])].sort((a, b) => b.at.localeCompare(a.at))
  const nextOverdue = /overdue|Today/.test(formatActionDate(opportunity.nextActionDate))

  const patch = (p: Partial<Opportunity>) => updateOpportunity(opportunity.id, p)
  const toggle = (key: 'formats' | 'valueOffered', value: string) => {
    const cur = opportunity[key]
    patch({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] })
  }
  const logDraft = () => {
    if (!draft.trim()) return
    patch({ activity: [...(opportunity.activity ?? []), activityEntry(draft.trim(), activeChannel)] })
    setDraft('')
  }

  // Two triggers — the monogram in the header and the swatch in the Brand colour
  // section — so they need a flag each. Sharing one mounted both pickers at once.
  const [headerColorOpen, setHeaderColorOpen] = useState(false)
  const [sectionColorOpen, setSectionColorOpen] = useState(false)

  const channelState = (name: Channel) => channels.find((c) => c.channel === name)!
  const chanTone = (s: string) =>
    /Replied|Connected/.test(s) ? '#5f7d69' : s === 'Sent' ? '#5f7d69' : s === 'Bounced' ? '#a05f57' : '#8d908b'

  return (
    <motion.aside
      initial={{ x: 460, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 460, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Brand details"
      className="absolute right-0 top-0 z-30 flex h-full w-[428px] max-w-full shrink-0 flex-col overflow-hidden border-l border-[#E5E5E7] bg-white shadow-2xl"
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-[#EDEDEF] px-5 py-4">
        <div className="relative shrink-0">
          <button
            onClick={() => setHeaderColorOpen((v) => !v)}
            title={brand?.color ? `Brand colour ${brand.color}` : 'Set a brand colour'}
            aria-label={brand?.color ? `Brand colour ${brand.color}. Change it` : 'Set a brand colour'}
            aria-expanded={headerColorOpen}
            className="grid h-[38px] w-[38px] place-items-center rounded-lg border text-[12px] font-semibold transition hover:brightness-105"
            style={
              brand?.color
                ? { backgroundColor: brand.color, borderColor: brand.color, color: contrastInk(brand.color) }
                : { backgroundColor: '#F5F3ED', borderColor: '#E5DFD1', color: '#736F65' }
            }
          >
            {monogram(brand?.name ?? '??')}
          </button>
          {headerColorOpen && brand && (
            <div className="absolute left-0 top-[44px] z-40">
              <BrandColorPicker
                value={brand.color}
                onChange={(hex) => updateBrand(brand.id, { color: hex })}
                onClose={() => setHeaderColorOpen(false)}
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[1.3px] text-[#8e9189]">
            <Icon name={info.icon} size={11} />
            <span>{info.label}</span>
            <span className="text-[#dcdcde]">·</span>
            <span style={{ color: opportunity.priority === 'High' ? '#8f6d33' : '#9a9d97' }}>
              {opportunity.priority ?? 'Normal'} priority
            </span>
          </div>
          <h2 className="mt-1 truncate font-display text-[19px] text-[#1C1C1E]">
            {brand?.name ?? 'Unknown brand'}
          </h2>
          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[#6f7370]">
            <span className="font-mono text-[10px] text-[#9a9d97]">{String(destIndex + 1).padStart(2, '0')}</span>
            <span>{dest.name}</span>
            <span className="text-[#dcdcde]">·</span>
            <span>{opportunity.stage}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg bg-transparent p-1.5 text-[#9a9d97] hover:bg-[#F7F7F5] hover:text-[#1C1C1E]"
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-5 pb-7 pt-4">
        {/* Stat grid */}
        <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#EDEDEF] bg-[#EDEDEF]">
          <StatCell label="Health">
            <span className="flex items-center gap-1.5" style={{ color: healthColor }}>
              <i className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: healthColor }} />
              {wh}
            </span>
          </StatCell>
          <StatCell label="Last contact">
            {lastContact(opportunity)
              ? new Date(lastContact(opportunity)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : 'Not logged'}
          </StatCell>
          <StatCell label="Potential value">
            <span className="font-mono">{opportunity.fee || '—'}</span>
          </StatCell>
          <StatCell label="Confirmed">
            <span className="font-mono" style={{ color: confirmed === '—' ? '#9a9d97' : '#5f7d69' }}>
              {confirmed}
            </span>
          </StatCell>
        </div>

        {/* Next action */}
        <div
          className="mb-4 rounded-xl p-3.5"
          style={{
            border: `1px solid ${nextOverdue ? 'rgba(200,168,107,.5)' : '#EDEDEF'}`,
            background: nextOverdue ? 'rgba(200,168,107,.07)' : '#FCFCFB',
          }}
        >
          <Eyebrow>Next action</Eyebrow>
          <input
            value={opportunity.nextAction}
            onChange={(e) => patch({ nextAction: e.target.value })}
            placeholder="Set the next step"
            className={`${inputClass} mt-2`}
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              type="date"
              value={opportunity.nextActionDate}
              onChange={(e) => patch({ nextActionDate: e.target.value })}
              className={`${inputClass} w-auto`}
            />
            {opportunity.nextActionDate && (
              <span className="text-[11.5px] text-[#6f7370]">
                {formatActionDate(opportunity.nextActionDate)}
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              disabled={!opportunity.nextAction.trim()}
              onClick={() => patch(completeAction(opportunity))}
              className="rounded-lg bg-[#1C1C1E] px-3 py-2 text-[11.5px] font-medium text-white disabled:opacity-40"
            >
              Complete
            </button>
            <button
              onClick={() =>
                patch({
                  nextActionDate: localDate(1),
                  activity: [...(opportunity.activity ?? []), activityEntry('Snoozed next action until tomorrow')],
                })
              }
              className="rounded-lg border border-[#E5E5E7] bg-white px-3 py-2 text-[11.5px] text-[#4a4d48]"
            >
              Snooze
            </button>
          </div>
          {state === 'none' && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-[#6f7370]">
              Nothing scheduled. Deals die of silence more often than rejection — give it a date.
            </p>
          )}
        </div>

        {/* Stage */}
        <div className="mb-5">
          <Eyebrow>Stage</Eyebrow>
          <select
            value={opportunity.stage}
            onChange={(e) => patch(stageChange(opportunity, e.target.value as Opportunity['stage']))}
            className={`${inputClass} mt-2 cursor-pointer`}
            style={{ color: STAGE_COLOR[opportunity.stage] }}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Outreach routes */}
        <div className="mb-6">
          <div className="mb-2.5 flex items-baseline justify-between">
            <Eyebrow>Outreach routes</Eyebrow>
            <span className="text-[10px] text-[#9a9d97]">One relationship, three routes</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {CHANNELS.map((name) => {
              const cs = channelState(name)
              const on = activeChannel === name
              return (
                <button
                  key={name}
                  onClick={() => setActiveChannel(name)}
                  className="rounded-xl px-2.5 py-2.5 text-left"
                  style={{
                    border: `1px solid ${on ? 'rgba(200,168,107,.55)' : '#E9E9EB'}`,
                    background: on ? 'rgba(200,168,107,.08)' : '#ffffff',
                    color: on ? '#1C1C1E' : '#6f7370',
                  }}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11.5px] font-medium">{name}</span>
                    <i className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: chanTone(cs.state) }} />
                  </div>
                  <div className="mt-1 text-[10.5px] text-[#6f7370]">{cs.state}</div>
                </button>
              )
            })}
          </div>
          <div className="mt-2.5 rounded-xl border border-[#EDEDEF] bg-[#FCFCFB] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11.5px] font-medium text-[#1C1C1E]">{active.channel}</span>
              <span
                className="rounded-full border px-2 py-0.5 text-[10px]"
                style={{
                  borderColor: chanTone(active.state) === '#5f7d69' ? 'rgba(95,125,105,.4)' : '#E9E9EB',
                  color: chanTone(active.state),
                }}
              >
                {active.state}
              </span>
            </div>
            <div className="flex items-baseline gap-2.5 py-1 text-[11.5px]">
              <span className="w-[112px] shrink-0 text-[#8e9189]">Sent through this route</span>
              <span className="min-w-0 flex-1 text-[#3a3a3c]">
                {active.count === 0 ? 'None' : `${active.count} message${active.count === 1 ? '' : 's'}`}
              </span>
            </div>
            <div className="flex items-baseline gap-2.5 py-1 text-[11.5px]">
              <span className="w-[112px] shrink-0 text-[#8e9189]">Last activity</span>
              <span className="min-w-0 flex-1 text-[#3a3a3c]">
                {active.last
                  ? new Date(active.last).toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </span>
            </div>
            <p className="mt-2 border-t border-[#EDEDEF] pt-2 text-[10.5px] leading-relaxed text-[#9a9d97]">
              Director does not connect to {active.channel}. Nothing is marked as sent unless you log it here.
            </p>
          </div>
        </div>

        {/* Journey */}
        <div className="mb-6">
          <div className="mb-2.5">
            <Eyebrow>Full journey</Eyebrow>
          </div>
          <div className="flex flex-col">
            {DESTINATIONS.slice(0, 12).map((d, i) => {
              const passed = i < destIndex
              const here = i === destIndex
              const dot = passed ? '#5f7d69' : here ? '#C8A86B' : '#ffffff'
              const ring = i <= destIndex ? 'transparent' : '#DEDEE0'
              const color = here ? '#1C1C1E' : passed ? '#6f7370' : '#9a9d97'
              return (
                <div key={d.key} className="flex items-center gap-2.5 py-1">
                  <span className="w-[18px] shrink-0 font-mono text-[9.5px] text-[#b4b7b1]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="h-[8px] w-[8px] shrink-0 rounded-full"
                    style={{ backgroundColor: dot, border: `1px solid ${ring}` }}
                  />
                  <span className="text-[12px]" style={{ color, fontWeight: here ? 600 : 400 }}>
                    {d.name}
                  </span>
                  <span className="ml-auto text-[10.5px] text-[#9a9d97]">
                    {here ? 'Here now' : passed ? 'Passed' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Journey plan (existing per-opportunity plan) */}
        {journey.length > 0 && (
          <div className="mb-6">
            <div className="mb-2.5">
              <Eyebrow>Upcoming steps</Eyebrow>
            </div>
            <div className="flex flex-col gap-1 border-l border-[#EDEDEF] pl-3">
              {journey.slice(0, 6).map((s) => (
                <div key={s.id} className="text-[11.5px] text-[#4a4d48]">
                  <span className="mr-1.5 text-[#9a9d97]">→</span>
                  {s.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outcome */}
        {outcome === 'Won' && (
          <div
            className="mb-5 rounded-xl border p-3.5"
            style={{ borderColor: 'rgba(95,125,105,.4)', background: 'rgba(122,150,129,.08)' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-[1.1px]"
                style={{ borderColor: 'rgba(95,125,105,.4)', color: '#4d7a4a' }}
              >
                WON
              </span>
              <span className="text-[11px] text-[#8e9189]">
                Passed the deal gate — {opportunity.stage.toLowerCase()}
              </span>
            </div>
          </div>
        )}

        {/* Strategy: the pitch formula reads straight off these. */}
        <div className="mb-4">
          <Eyebrow>What you noticed about them</Eyebrow>
          <textarea
            value={opportunity.brandObservation ?? ''}
            onChange={(e) => patch({ brandObservation: e.target.value })}
            rows={2}
            placeholder="Their festive campaign was all heavy sets — nothing for everyday wear."
            className={`${inputClass} mt-2 resize-none leading-relaxed`}
          />
        </div>
        <div className="mb-4">
          <Eyebrow>Why this brand fits</Eyebrow>
          <textarea
            value={opportunity.fit}
            onChange={(e) => patch({ fit: e.target.value })}
            rows={2}
            placeholder="Beauty and styling, same audience."
            className={`${inputClass} mt-2 resize-none leading-relaxed`}
          />
        </div>

        {/* Idea + concept + fee */}
        <div className="mb-4">
          <Eyebrow>The idea</Eyebrow>
          <input
            value={opportunity.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="One Lipstick, Three Outfits"
            className={`${inputClass} mt-2`}
          />
        </div>
        <div className="mb-4">
          <Eyebrow>What happens in it</Eyebrow>
          <textarea
            value={opportunity.concept}
            onChange={(e) => patch({ concept: e.target.value })}
            rows={3}
            placeholder="Three completely different looks built around one shade."
            className={`${inputClass} mt-2 resize-none leading-relaxed`}
          />
        </div>
        <div className="mb-4">
          <Eyebrow>Why the audience would care</Eyebrow>
          <textarea
            value={opportunity.audienceWhy}
            onChange={(e) => patch({ audienceWhy: e.target.value })}
            rows={2}
            placeholder="Practical styling rather than another product review."
            className={`${inputClass} mt-2 resize-none leading-relaxed`}
          />
        </div>
        {info.formats.length > 0 && (
          <div className="mb-5">
            <Eyebrow>{info.formatsLabel}</Eyebrow>
            <div className="mt-2">
              <Chips options={info.formats} selected={opportunity.formats} onToggle={(v) => toggle('formats', v)} />
            </div>
          </div>
        )}
        {opportunity.type === 'paid' && (
          <div className="mb-5">
            <Eyebrow>What value are you offering?</Eyebrow>
            <div className="mt-2">
              <Chips options={VALUE_OFFERED} selected={opportunity.valueOffered} onToggle={(v) => toggle('valueOffered', v)} />
            </div>
          </div>
        )}
        {opportunity.type !== 'pr' && (
          <div className="mb-5">
            <Eyebrow>Fee</Eyebrow>
            <input
              value={opportunity.fee}
              onChange={(e) => patch({ fee: e.target.value })}
              placeholder="₹25,000"
              className={`${inputClass} mt-2`}
            />
          </div>
        )}

        <PitchBuilder opportunity={opportunity} brand={brand} />

        <ContactNucleus opportunity={opportunity} brand={brand} />

        {brand && (
          <div className="mb-4 rounded-xl border border-[#EDEDEF] bg-[#FCFCFB] p-3.5">
            <Eyebrow>Brand colour</Eyebrow>
            <div className="relative mt-2 flex items-center gap-2.5">
              <button
                onClick={() => setSectionColorOpen((v) => !v)}
                aria-expanded={sectionColorOpen}
                className="h-8 w-8 shrink-0 rounded-md border transition hover:brightness-105"
                style={
                  brand.color
                    ? { backgroundColor: brand.color, borderColor: brand.color }
                    : {
                        borderColor: '#E5DFD1',
                        // A diagonal rule reads as "nothing set" without needing a label.
                        backgroundImage:
                          'linear-gradient(135deg, #F5F3ED 46%, #D6CFC0 46%, #D6CFC0 54%, #F5F3ED 54%)',
                      }
                }
              />
              <button
                onClick={() => setSectionColorOpen((v) => !v)}
                className="rounded-md bg-transparent p-0 text-left text-[12px] text-[#1C1C1E] hover:underline"
              >
                {brand.color ? (
                  <span className="font-mono tracking-wide">{brand.color}</span>
                ) : (
                  <span className="text-[#8d908b]">Pick a colour for {brand.name}</span>
                )}
              </button>
              {sectionColorOpen && (
                <div className="absolute left-0 top-[38px] z-40">
                  <BrandColorPicker
                    value={brand.color}
                    onChange={(hex) => updateBrand(brand.id, { color: hex })}
                    onClose={() => setSectionColorOpen(false)}
                  />
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#8d908b]">
              Marks this brand on the map and in the table. The ring around its pin still shows deal health.
            </p>
          </div>
        )}

        {brand && (
          <div className="mb-6 rounded-xl border border-[#EDEDEF] bg-[#FCFCFB] p-3.5">
            <Eyebrow>Contact at {brand.name}</Eyebrow>
            <input
              value={brand.contactName}
              onChange={(e) => updateBrand(brand.id, { contactName: e.target.value })}
              placeholder="Name"
              className={`${inputClass} mb-2 mt-2`}
            />
            <input
              value={brand.contactEmail}
              onChange={(e) => updateBrand(brand.id, { contactEmail: e.target.value })}
              placeholder="email@brand.com"
              className={inputClass}
            />
          </div>
        )}

        {/* Communication timeline */}
        <div className="mb-4">
          <div className="mb-2.5 flex items-baseline justify-between">
            <Eyebrow>Communication timeline</Eyebrow>
            <span className="text-[10px] text-[#9a9d97]">Email · Instagram · LinkedIn · notes</span>
          </div>
          <div className="mb-3 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add activity — what happened?"
              className={inputClass}
            />
            <select
              value={activeChannel}
              onChange={(e) => setActiveChannel(e.target.value as Channel)}
              className="rounded-lg border border-[#E5E5E7] bg-white px-2 text-[11.5px] text-[#4a4d48]"
            >
              {(['Email', 'Instagram', 'LinkedIn', 'Notes'] as Activity['channel'][]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={logDraft}
              className="shrink-0 rounded-lg border border-[#E5E5E7] bg-[#F7F7F5] px-3 py-2 text-[11.5px] text-[#4a4d48]"
            >
              Add
            </button>
          </div>
          <div className="border-l border-[#EDEDEF] pl-4">
            {timeline.length === 0 && (
              <p className="text-[11.5px] text-[#9a9d97]">
                No activity logged yet. Add the last conversation to keep the context together.
              </p>
            )}
            {timeline.map((a) => (
              <div key={a.id} className="relative pb-4">
                <span
                  className="absolute -left-[19px] top-1 h-[7px] w-[7px] rounded-full border-2 border-white"
                  style={{ backgroundColor: healthColor }}
                />
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-[#E9E9EB] px-2 py-0.5 text-[9.5px] text-[#6f7370]">
                    {a.channel}
                  </span>
                  <span className="font-mono text-[9.5px] text-[#a8aba5]">
                    {new Date(a.at).toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[#3a3a3c] [text-wrap:pretty]">{a.text}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            deleteOpportunity(opportunity.id)
            onClose()
          }}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#9a9d97] hover:bg-red-400/10 hover:text-red-400"
        >
          <Trash2 size={13} />
          Delete this opportunity
        </button>
      </div>
    </motion.aside>
  )
}
