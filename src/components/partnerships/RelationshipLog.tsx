import { useState } from 'react'
import { WORLD_HEALTH_COLOR, worldHealth, type Activity, type Brand, type Opportunity } from '../../lib/partnerships'

const FILTERS = ['All', 'Email', 'Instagram', 'LinkedIn', 'Notes'] as const

interface LogRow {
  id: string
  brandId: string
  brand: string
  channel: Activity['channel']
  when: string
  text: string
  health: ReturnType<typeof worldHealth>
}

export function RelationshipLog({
  opportunities,
  brandsById,
  onOpen,
}: {
  opportunities: Opportunity[]
  brandsById: Map<string, Brand>
  onOpen: (id: string) => void
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')

  const rows: LogRow[] = opportunities
    .flatMap((o) =>
      (o.activity ?? []).map((a) => ({
        id: `${o.id}-${a.id}`,
        brandId: o.id,
        brand: brandsById.get(o.brandId)?.name ?? 'Unknown brand',
        channel: a.channel,
        when: a.at,
        text: a.text,
        health: worldHealth(o),
      })),
    )
    .filter((r) => filter === 'All' || r.channel === filter)
    .sort((a, b) => b.when.localeCompare(a.when))

  return (
    <div className="absolute inset-0 flex flex-col bg-white text-[#1C1C1E]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#EDEDEF] px-4 py-3">
        <span className="mr-1 text-[10.5px] text-[#8e9189]">{rows.length} entries</span>
        {FILTERS.map((f) => {
          const on = filter === f
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-md px-2.5 py-1 text-[10.5px]"
              style={{
                border: `1px solid ${on ? 'rgba(200,168,107,.5)' : '#E5E5E7'}`,
                background: on ? 'rgba(200,168,107,.1)' : '#ffffff',
                color: on ? '#8f6d33' : '#6f7370',
              }}
            >
              {f}
            </button>
          )
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-1">
        {rows.length === 0 && (
          <div className="grid h-full place-items-center text-[12px] text-[#9a9d97]">
            No activity has been logged yet.
          </div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-3 border-b border-[#F4F4F6] px-1 py-3">
            <span className="w-[112px] shrink-0 font-mono text-[10.5px] text-[#9a9d97]">
              {new Date(r.when).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="w-[82px] shrink-0 rounded-full border border-[#E9E9EB] px-2 py-0.5 text-center text-[10px] text-[#6f7370]">
              {r.channel}
            </span>
            <button
              onClick={() => onOpen(r.brandId)}
              className="w-[150px] shrink-0 border-0 bg-transparent p-0 text-left text-[11.5px] font-medium text-[#1C1C1E]"
            >
              {r.brand}
            </button>
            <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-[#4a4d48] [text-wrap:pretty]">
              {r.text}
            </span>
            <span
              className="mt-1.5 h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ backgroundColor: WORLD_HEALTH_COLOR[r.health] }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
