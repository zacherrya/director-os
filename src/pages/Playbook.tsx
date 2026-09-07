import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import { describeRule } from '../lib/playbook'
import type { PlaybookRule, PlaybookRuleKind } from '../lib/types'
import { HOOK_TYPE_OPTIONS, PLAYBOOK_RULE_KINDS, PURPOSE_OPTIONS } from '../lib/types'
import { Check, ChevronDown, Icon, Plus, Trash2, X } from '../components/Icon'

/** Starting points, phrased as suggestions rather than defaults — an empty
 * playbook is unhelpful, but silently imposing rules would be worse. */
const SUGGESTIONS: Omit<PlaybookRule, 'id' | 'createdAt'>[] = [
  {
    kind: 'hookMaxSeconds',
    value: 3,
    text: 'The hook lands its promise within 3 seconds',
    origin: 'suggested',
    enabled: true,
  },
  {
    kind: 'requireEndBeat',
    target: 'CTA',
    text: 'Every video ends on a CTA',
    origin: 'suggested',
    enabled: true,
  },
  {
    kind: 'runtimeMaxSeconds',
    value: 30,
    text: 'Keep it under 30 seconds',
    origin: 'suggested',
    enabled: true,
  },
]

const ORIGIN_LABEL: Record<PlaybookRule['origin'], { label: string; tone: string }> = {
  insight: { label: 'from your data', tone: '#a97b2f' },
  manual: { label: 'yours', tone: '#6d6659' },
  suggested: { label: 'suggested', tone: '#6d6659' },
}

function RuleEditor({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Omit<PlaybookRule, 'id' | 'createdAt'>
  onChange: (d: Omit<PlaybookRule, 'id' | 'createdAt'>) => void
  onSave: () => void
  onCancel: () => void
}) {
  const projects = useAppStore((s) => s.projects).filter((p) => !p.deletedAt)
  const spec = PLAYBOOK_RULE_KINDS.find((k) => k.value === draft.kind)!

  return (
    <div className="rounded-xl border border-gold/40 bg-gold-soft p-4">
      <label className="mb-1 block text-[11.5px] font-medium text-ink-dim">Rule</label>
      <input
        autoFocus
        value={draft.text}
        onChange={(e) => onChange({ ...draft, text: e.target.value })}
        placeholder="e.g. Open on the wardrobe, never on me"
        className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:border-gold"
      />

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-ink-dim">Enforce as</label>
          <div className="relative">
            <select
              value={draft.kind}
              onChange={(e) => onChange({ ...draft, kind: e.target.value as PlaybookRuleKind })}
              className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-surface px-3 py-2 pr-8 text-[12.5px] text-ink outline-none focus:border-gold"
            >
              {PLAYBOOK_RULE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-ink-dim">
            {spec.needs === 'seconds' ? 'Seconds' : spec.needs === 'beat' ? 'Beat' : spec.needs === 'hookType' ? 'Hook type' : ' '}
          </label>
          {spec.needs === 'seconds' && (
            <input
              type="number"
              min={1}
              value={draft.value ?? ''}
              onChange={(e) => onChange({ ...draft, value: Number(e.target.value) })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] text-ink outline-none focus:border-gold"
            />
          )}
          {(spec.needs === 'beat' || spec.needs === 'hookType') && (
            <div className="relative">
              <select
                value={draft.target ?? ''}
                onChange={(e) => onChange({ ...draft, target: e.target.value })}
                className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-surface px-3 py-2 pr-8 text-[12.5px] text-ink outline-none focus:border-gold"
              >
                <option value="">Choose…</option>
                {(spec.needs === 'beat' ? PURPOSE_OPTIONS : HOOK_TYPE_OPTIONS).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint" />
            </div>
          )}
          {spec.needs === 'none' && (
            <p className="pt-2 text-[11px] leading-tight text-ink-faint">Shown as a checklist item.</p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-[11.5px] font-medium text-ink-dim">Applies to</label>
        <div className="relative">
          <select
            value={draft.projectId ?? ''}
            onChange={(e) => onChange({ ...draft, projectId: e.target.value === '' ? undefined : e.target.value })}
            className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-surface px-3 py-2 pr-8 text-[12.5px] text-ink outline-none focus:border-gold"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint" />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-ink-dim hover:bg-surface-2">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!draft.text.trim()}
          className="rounded-lg bg-gold px-3.5 py-1.5 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-40"
        >
          Save rule
        </button>
      </div>
    </div>
  )
}

const BLANK: Omit<PlaybookRule, 'id' | 'createdAt'> = {
  kind: 'reminder',
  text: '',
  origin: 'manual',
  enabled: true,
}

export function Playbook() {
  const playbook = useAppStore((s) => s.playbook)
  const projects = useAppStore((s) => s.projects)
  const addPlaybookRule = useAppStore((s) => s.addPlaybookRule)
  const updatePlaybookRule = useAppStore((s) => s.updatePlaybookRule)
  const deletePlaybookRule = useAppStore((s) => s.deletePlaybookRule)

  const [draft, setDraft] = useState<Omit<PlaybookRule, 'id' | 'createdAt'> | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const unusedSuggestions = useMemo(
    () => SUGGESTIONS.filter((s) => !playbook.some((r) => r.kind === s.kind && r.text === s.text)),
    [playbook],
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-10 py-10">
        <div className="mb-7 flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2.5 font-display text-[28px] tracking-tight text-ink">
              <Icon name="clipboard-list" size={23} className="text-gold" />
              Playbook
            </h1>
            <p className="mt-1 max-w-[520px] text-[13.5px] leading-relaxed text-ink-dim">
              Rules you've earned. The draft check enforces these on every episode, ahead of its own
              general advice — so a lesson you learn once keeps working.
            </p>
          </div>
          {!draft && (
            <button
              onClick={() => setDraft(BLANK)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2.5 text-[13px] font-medium text-[#141316] transition hover:bg-gold-bright"
            >
              <Plus size={15} strokeWidth={2} />
              New Rule
            </button>
          )}
        </div>

        {draft && (
          <div className="mb-5">
            <RuleEditor
              draft={draft}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={() => {
                addPlaybookRule(draft)
                setDraft(null)
              }}
            />
          </div>
        )}

        {playbook.length === 0 && !draft && (
          <div className="mb-6 rounded-2xl border border-dashed border-border py-14 text-center">
            <p className="text-[13.5px] text-ink-dim">No rules yet.</p>
            <p className="mx-auto mt-1 max-w-[420px] text-[12px] leading-relaxed text-ink-faint">
              Add one below, write your own, or send an insight here from the Analytics page when the data
              actually proves something.
            </p>
          </div>
        )}

        <div className="mb-8 flex flex-col gap-2">
          {playbook.map((rule) => {
            const origin = ORIGIN_LABEL[rule.origin]
            const confirming = confirmingId === rule.id
            return (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                  rule.enabled ? 'border-border bg-surface' : 'border-border-soft bg-surface-2 opacity-60'
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <button
                    onClick={() => updatePlaybookRule(rule.id, { enabled: !rule.enabled })}
                    title={rule.enabled ? 'Disable this rule' : 'Enable this rule'}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      rule.enabled ? 'border-gold bg-gold text-[#141316]' : 'border-border text-transparent hover:border-ink-faint'
                    }`}
                  >
                    <Check size={11} strokeWidth={3} />
                  </button>
                  <div className="min-w-0">
                    <div className="text-[13px] leading-snug text-ink">{rule.text}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                      <span>{describeRule(rule, projects)}</span>
                      <span>·</span>
                      <span style={{ color: origin.tone }}>{origin.label}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {confirming ? (
                    <>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="rounded-md p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => {
                          deletePlaybookRule(rule.id)
                          setConfirmingId(null)
                        }}
                        className="rounded-md bg-red-400/10 p-1.5 text-red-400 hover:bg-red-400/20"
                      >
                        <Check size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(rule.id)}
                      className="rounded-md p-1.5 text-ink-faint transition hover:bg-red-400/10 hover:text-red-400"
                      title="Delete rule"
                      aria-label="Delete rule"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>

        {unusedSuggestions.length > 0 && (
          <div>
            <div className="mb-2 text-[11.5px] font-medium tracking-wide text-ink-faint uppercase">
              Common starting points
            </div>
            <div className="flex flex-col gap-2">
              {unusedSuggestions.map((s) => (
                <button
                  key={s.text}
                  onClick={() => addPlaybookRule(s)}
                  className="group flex items-center justify-between rounded-xl border border-dashed border-border px-4 py-3 text-left transition hover:border-gold"
                >
                  <span className="text-[12.5px] text-ink-dim group-hover:text-ink">{s.text}</span>
                  <span className="flex items-center gap-1 text-[11.5px] font-medium text-ink-faint group-hover:text-gold">
                    <Plus size={13} />
                    Add
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
              These are general short-form conventions, not conclusions from your data. Adopt one only if it
              matches what you've actually seen work.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
