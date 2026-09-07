import { useAppStore } from '../../store/appStore'
import {
  DESTINATIONS,
  STAGES,
  STAGE_COLOR,
  WORLD_HEALTH_COLOR,
  actionState,
  confirmedValue,
  destinationIndex,
  formatActionDate,
  lastContact,
  outcomeOf,
  stageChange,
  worldHealth,
  type Brand,
  type Opportunity,
} from '../../lib/partnerships'

const COLUMNS = [
  'Brand',
  'Type',
  'World location',
  'Stage',
  'Next action',
  'Due',
  'Contact',
  'Channel',
  'Last contact',
  'Potential',
  'Confirmed',
  'Priority',
  'Health',
  'Outcome',
]

const monogram = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0] ?? '')
    .join('')
    .toUpperCase()

const shortType = (o: Opportunity) => (o.type === 'unsure' ? 'Not sure' : o.type === 'paid' ? 'Paid' : o.type.toUpperCase())

function dueTone(o: Opportunity): string {
  const state = actionState(o)
  if (state === 'overdue') return '#a05f57'
  if (state === 'today') return '#8f6d33'
  return '#9a9d97'
}

function primaryChannel(o: Opportunity): string {
  const acts = (o.activity ?? []).filter((a) => a.channel !== 'Notes')
  const counts: Record<string, number> = {}
  acts.forEach((a) => {
    counts[a.channel] = (counts[a.channel] || 0) + 1
  })
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return top?.[0] ?? 'None yet'
}

export function PartnershipTable({
  opportunities,
  brandsById,
  onOpen,
}: {
  opportunities: Opportunity[]
  brandsById: Map<string, Brand>
  onOpen: (id: string) => void
}) {
  const update = useAppStore((s) => s.updateOpportunity)

  const exportCsv = () => {
    const head = COLUMNS.join(',')
    const body = opportunities
      .map((o) => {
        const brand = brandsById.get(o.brandId)
        const dest = DESTINATIONS[destinationIndex(o)]
        const cells = [
          brand?.name ?? 'Unknown brand',
          shortType(o),
          dest.name,
          o.stage,
          o.nextAction,
          formatActionDate(o.nextActionDate),
          brand?.contactName ?? '',
          primaryChannel(o),
          lastContact(o) ? new Date(lastContact(o)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Not logged',
          o.fee || '—',
          confirmedValue(o),
          o.priority ?? 'Normal',
          worldHealth(o),
          outcomeOf(o),
        ]
        return cells.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')
      })
      .join('\n')
    const url = URL.createObjectURL(new Blob([head + '\n' + body], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'opportunities.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-white text-[#1C1C1E]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#EDEDEF] px-4 py-3 text-[10.5px] text-[#8e9189]">
        <span>{opportunities.length} shown · same records as the world</span>
        <span className="ml-auto flex gap-2">
          <button
            onClick={exportCsv}
            className="rounded-md border border-[#E5E5E7] bg-white px-2.5 py-1.5 text-[10.5px] text-[#4a4d48]"
          >
            Export CSV
          </button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse whitespace-nowrap text-[11.5px]">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c}
                  className="sticky top-0 border-b border-[#E5E5E7] bg-[#F7F7F5] px-3 py-3 text-left text-[10px] font-medium text-[#83867e]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {opportunities.map((o) => {
              const brand = brandsById.get(o.brandId)
              const dest = DESTINATIONS[destinationIndex(o)]
              const h = worldHealth(o)
              const dot = WORLD_HEALTH_COLOR[h]
              const confirmed = confirmedValue(o)
              const outcome = outcomeOf(o)
              return (
                <tr key={o.id} className="border-b border-[#F2F2F4] hover:bg-[#FCFBF8]">
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => onOpen(o.id)}
                      className="flex items-center gap-2 border-0 bg-transparent p-0"
                    >
                      <span className="grid h-[26px] w-[26px] place-items-center rounded-md border border-[#E5DFD1] bg-[#F5F3ED] text-[9.5px] font-semibold text-[#736F65]">
                        {monogram(brand?.name ?? '??')}
                      </span>
                      <b className="text-[11.5px] font-medium text-[#1C1C1E]">{brand?.name ?? 'Unknown brand'}</b>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-[#6f7370]">{shortType(o)}</td>
                  <td className="px-3 py-2.5 text-[#6f7370]">
                    <span className="font-mono text-[10px] text-[#9a9d97]">
                      {String(destinationIndex(o) + 1).padStart(2, '0')}
                    </span>{' '}
                    {dest.name}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={o.stage}
                      onChange={(e) => update(o.id, stageChange(o, e.target.value as Opportunity['stage']))}
                      style={{ color: STAGE_COLOR[o.stage] }}
                      className="cursor-pointer rounded border border-transparent bg-transparent px-1 py-1 text-[11.5px]"
                    >
                      {STAGES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      value={o.nextAction}
                      onChange={(e) => update(o.id, { nextAction: e.target.value })}
                      className="w-[170px] rounded border border-transparent bg-transparent px-1 py-1 text-[11.5px] text-[#4a4d48]"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-[10.5px]" style={{ color: dueTone(o) }}>
                      {formatActionDate(o.nextActionDate) || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#6f7370]">{brand?.contactName || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full border border-[#E9E9EB] px-2 py-0.5 text-[10px] text-[#6f7370]">
                      {primaryChannel(o)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#8e9189]">
                    {lastContact(o)
                      ? new Date(lastContact(o)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                      : 'Not logged'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[#4a4d48]">{o.fee || '—'}</td>
                  <td
                    className="px-3 py-2.5 font-mono"
                    style={{ color: confirmed === '—' ? '#9a9d97' : '#5f7d69' }}
                  >
                    {confirmed}
                  </td>
                  <td className="px-3 py-2.5 text-[#6f7370]">{o.priority ?? 'Normal'}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5" style={{ color: dot }}>
                      <i
                        className="inline-block h-[5px] w-[5px] rounded-full"
                        style={{ backgroundColor: dot }}
                      />
                      {h}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2.5"
                    style={{ color: outcome === 'Won' ? '#5f7d69' : outcome === 'Declined' ? '#a05f57' : '#6f7370' }}
                  >
                    {outcome}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
