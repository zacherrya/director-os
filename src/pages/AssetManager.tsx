import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { ASSET_CATEGORIES, type AssetCategory, type AssetStatus } from '../lib/types'
import { Icon, Plus, Search, X } from '../components/Icon'

const CATEGORY_ICON: Record<AssetCategory, string> = {
  'AI Videos': 'film',
  Images: 'image',
  Music: 'music',
  SFX: 'sparkles',
  Fonts: 'notebook-pen',
  Logos: 'flame',
  Icons: 'palette',
  Props: 'wrench',
  Wardrobe: 'shirt',
}

const STATUS_COLOR: Record<AssetStatus, string> = {
  Generated: '#4f8fc0',
  Approved: '#6bb15a',
  'Needs Revision': '#c4494f',
  Pending: '#a8a29a',
}

const STATUS_OPTIONS: AssetStatus[] = ['Pending', 'Generated', 'Approved', 'Needs Revision']

export function AssetManager() {
  const { projectId } = useParams()
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const allEpisodes = useAppStore((s) => s.episodes)
  const allAssets = useAppStore((s) => s.assets)
  const updateAsset = useAppStore((s) => s.updateAsset)
  const addAsset = useAppStore((s) => s.addAsset)

  const [category, setCategory] = useState<AssetCategory | 'All'>('All')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  const episodes = useMemo(() => allEpisodes.filter((e) => e.projectId === projectId), [allEpisodes, projectId])
  const assets = useMemo(() => allAssets.filter((a) => a.projectId === projectId), [allAssets, projectId])

  const sceneLookup = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>()
    for (const ep of episodes) {
      for (const scene of ep.scenes) {
        map.set(scene.id, { label: `Lesson ${String(ep.number).padStart(3, '0')} · Scene ${scene.index}`, color: '#d3a75c' })
      }
    }
    return map
  }, [episodes])

  const filtered = assets.filter((a) => {
    if (category !== 'All' && a.category !== category) return false
    if (query && !a.name.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-ink-dim">
        Project not found. <Link to="/projects" className="ml-2 text-gold">Back to Projects</Link>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-10 py-10">
        <div className="mb-1.5 flex items-center gap-2 text-[12.5px] text-ink-faint">
          <Link to="/projects" className="hover:text-ink-dim">
            Projects
          </Link>
          <span>/</span>
          <Link to={`/projects/${project.id}`} className="hover:text-ink-dim">
            {project.name}
          </Link>
          <span>/</span>
          <span className="text-ink-dim">Asset Manager</span>
        </div>

        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-[26px] tracking-tight text-ink">Asset Manager</h1>
            <p className="mt-1 text-[13px] text-ink-dim">
              Every AI video, image, sound, and prop collected automatically from this project.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2.5 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright"
          >
            <Plus size={15} strokeWidth={2} />
            Add Asset
          </button>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 max-w-[320px]">
          <Search size={15} className="text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets..."
            className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint"
          />
        </div>

        <div className="mb-7 flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory('All')}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
              category === 'All' ? 'border-gold bg-gold-soft text-gold' : 'border-border text-ink-dim hover:border-ink-faint'
            }`}
          >
            All ({assets.length})
          </button>
          {ASSET_CATEGORIES.map((c) => {
            const count = assets.filter((a) => a.category === c).length
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
                  category === c ? 'border-gold bg-gold-soft text-gold' : 'border-border text-ink-dim hover:border-ink-faint'
                }`}
              >
                <Icon name={CATEGORY_ICON[c]} size={12} />
                {c} ({count})
              </button>
            )
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-[13px] text-ink-faint">
            No assets in this category yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((asset, i) => (
              <motion.div
                key={asset.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.3) }}
                className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3.5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-gold">
                  <Icon name={CATEGORY_ICON[asset.category]} size={17} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-ink">{asset.name}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-ink-faint">{asset.category}</span>
                  </div>
                  {asset.notes && <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">{asset.notes}</p>}
                </div>

                <div className="hidden shrink-0 flex-wrap gap-1.5 md:flex md:max-w-[260px]">
                  {asset.linkedScenes.length === 0 ? (
                    <span className="text-[11px] text-ink-faint italic">Not linked</span>
                  ) : (
                    asset.linkedScenes.map((sceneId) => {
                      const info = sceneLookup.get(sceneId)
                      if (!info) return null
                      return (
                        <span key={sceneId} className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] text-ink-dim">
                          {info.label}
                        </span>
                      )
                    })
                  )}
                </div>

                <select
                  value={asset.status}
                  onChange={(e) => updateAsset(asset.id, { status: e.target.value as AssetStatus })}
                  className="shrink-0 rounded-full border-none px-2.5 py-1 text-[11px] font-medium"
                  style={{ backgroundColor: `${STATUS_COLOR[asset.status]}20`, color: STATUS_COLOR[asset.status] }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <AddAssetModal
          onClose={() => setShowForm(false)}
          onCreate={(a) => {
            addAsset({ ...a, projectId: project.id, linkedScenes: [] })
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

function AddAssetModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (asset: { category: AssetCategory; name: string; status: AssetStatus; notes: string }) => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<AssetCategory>('Images')
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[400px] rounded-2xl border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-[18px] text-ink">Add Asset</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <label className="mb-1 block text-[12px] font-medium text-ink-dim">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Closet Push-In — Hook Variant"
          className="mb-4 w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-gold"
        />

        <label className="mb-1 block text-[12px] font-medium text-ink-dim">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as AssetCategory)}
          className="mb-4 w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink focus:border-gold"
        >
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-[12px] font-medium text-ink-dim">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mb-6 w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-gold"
        />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-medium text-ink-dim hover:bg-surface-2">
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onCreate({ category, name: name.trim(), status: 'Pending', notes })}
            disabled={!name.trim()}
            className="rounded-lg bg-gold px-4 py-2 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add Asset
          </button>
        </div>
      </div>
    </div>
  )
}
