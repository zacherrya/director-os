import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Episode, Scene, SceneAsset, SpeakingPace } from '../../lib/types'
import {
  ANGLE_OPTIONS,
  ASSET_KIND_OPTIONS,
  DEFAULT_SPEAKING_PACE,
  EMOTION_OPTIONS,
  LENS_OPTIONS,
  MOVEMENT_OPTIONS,
  PACE_WORDS_PER_SECOND,
  PURPOSE_COLOR,
  PURPOSE_OPTIONS,
  SHOT_TYPE_OPTIONS,
  SPEAKING_PACE_OPTIONS,
} from '../../lib/types'
import { useAppStore } from '../../store/appStore'
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, Trash2, Wand2, X } from '../Icon'
import { stopMusic } from '../../lib/audioEngine'
import { useSceneAudioActions } from '../../lib/useSceneAudio'
import { generateSceneImage, hasOpenAiKey } from '../../lib/imageGen'
import { MusicPicker } from './MusicPicker'
import { AudioRegionSelector } from './AudioRegionSelector'
import { SfxPicker } from './SfxPicker'
import { HookWorkshop } from './HookWorkshop'
import { toast } from '../../lib/toast'

const ACTOR_DIRECTIONS = ['Smile', 'Pause', 'Look into camera', 'Walk in', 'Point at board', 'Look surprised']
const FONT_OPTIONS = ['Fraunces', 'Inter', 'IBM Plex Mono']
const ANIMATION_OPTIONS = ['Fade In', 'Fade Out', 'Slide In', 'Slide Up', 'Pop In', 'Write On']
const ASSET_STATUS_OPTIONS = ['Generated', 'Approved', 'Needs Revision', 'Pending'] as const
const ASSET_STATUS_COLOR: Record<string, string> = {
  Generated: '#4f8fc0',
  Approved: '#6bb15a',
  'Needs Revision': '#c4494f',
  Pending: '#a8a29a',
}

const tabs = ['Details', 'Dialogue', 'Audio', 'Notes', 'AI Assets'] as const
type Tab = (typeof tabs)[number]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11.5px] font-medium text-ink-dim">{label}</label>
      {children}
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: readonly string[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-border bg-surface-2 px-3 py-2 pr-8 text-[13px] text-ink transition focus:border-gold"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint" />
    </div>
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  showCount = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  showCount?: boolean
}) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-faint transition focus:border-gold"
      />
      {showCount && (
        <span className="pointer-events-none absolute right-2.5 bottom-2 text-[10.5px] text-ink-faint">
          {value.length}
        </span>
      )}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint transition focus:border-gold"
    />
  )
}

export function ScenePanel({
  episode,
  scene,
  onClose,
  onNavigate,
  focusVisual,
}: {
  episode: Episode
  scene: Scene
  onClose: () => void
  onNavigate: (direction: 1 | -1) => void
  /** Bump this (e.g. a counter) to force the panel to the Details tab and scroll/highlight the Visual generate section. */
  focusVisual?: number
}) {
  const [tab, setTab] = useState<Tab>('Details')
  const updateScene = useAppStore((s) => s.updateScene)
  const setSceneImage = useAppStore((s) => s.setSceneImage)
  const updateSceneDialogue = useAppStore((s) => s.updateSceneDialogue)
  const setScenePace = useAppStore((s) => s.setScenePace)
  const addSceneAsset = useAppStore((s) => s.addSceneAsset)
  const updateSceneAsset = useAppStore((s) => s.updateSceneAsset)
  const removeSceneAsset = useAppStore((s) => s.removeSceneAsset)
  const audio = useSceneAudioActions(episode.id, scene)
  const [tagInput, setTagInput] = useState('')
  const [generatingImage, setGeneratingImage] = useState(false)
  const [visualHighlight, setVisualHighlight] = useState(false)
  const visualSectionRef = useRef<HTMLDivElement>(null)

  const patch = (p: Partial<Scene>) => updateScene(episode.id, scene.id, p)
  const color = PURPOSE_COLOR[scene.purpose] ?? '#d3a75c'

  useEffect(() => {
    if (focusVisual === undefined) return
    setTab('Details')
    const raf = requestAnimationFrame(() => {
      visualSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    setVisualHighlight(true)
    const t = setTimeout(() => setVisualHighlight(false), 1400)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusVisual])

  async function handleGenerateVisual() {
    if (generatingImage) return
    if (!hasOpenAiKey()) {
      toast.error('Add an OpenAI API key in Settings first to generate AI stills.')
      return
    }
    setGeneratingImage(true)
    try {
      const dataUrl = await generateSceneImage(scene, episode)
      await setSceneImage(episode.id, scene.id, dataUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image generation failed.')
    } finally {
      setGeneratingImage(false)
    }
  }

  const dialogueWordCount = scene.dialogue.trim() === '' ? 0 : scene.dialogue.trim().split(/\s+/).length
  const effectivePace = scene.pace ?? episode.defaultPace ?? DEFAULT_SPEAKING_PACE
  const paceLabel = SPEAKING_PACE_OPTIONS.find((p) => p.value === effectivePace)?.label ?? effectivePace
  const estimatedSeconds =
    dialogueWordCount === 0 ? null : Math.max(0.5, Math.round((dialogueWordCount / PACE_WORDS_PER_SECOND[effectivePace]) * 2) / 2)

  useEffect(() => {
    return () => stopMusic()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id])

  function toggleActorDirection(dir: string) {
    const has = scene.actorDirection.includes(dir)
    patch({ actorDirection: has ? scene.actorDirection.filter((d) => d !== dir) : [...scene.actorDirection, dir] })
  }

  function addTag() {
    const t = tagInput.trim()
    if (!t || scene.tags.includes(t)) return
    patch({ tags: [...scene.tags, t] })
    setTagInput('')
  }

  return (
    <motion.div
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 360, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full w-[380px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border-soft px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[13.5px] font-medium text-ink">Scene {scene.index}</span>
          <span className="text-[13px] text-ink-faint">{scene.purpose}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onNavigate(-1)} className="rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => onNavigate(1)} className="rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink">
            <ChevronRight size={16} />
          </button>
          <button onClick={onClose} className="ml-1 rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border-soft px-3 pt-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-t-lg px-2.5 py-2 text-[12px] font-medium whitespace-nowrap transition ${
              tab === t ? 'border-b-2 border-gold text-ink' : 'text-ink-faint hover:text-ink-dim'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {tab === 'Details' && (
          <>
            <Field label="Purpose">
              <Select value={scene.purpose} onChange={(v) => patch({ purpose: v as Scene['purpose'] })} options={PURPOSE_OPTIONS} />
            </Field>
            <Field label="Emotion">
              <Select value={scene.emotion} onChange={(v) => patch({ emotion: v as Scene['emotion'] })} options={EMOTION_OPTIONS} />
            </Field>

            <div>
              <div className="mb-1.5 text-[11.5px] font-medium text-ink-dim">Camera</div>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Shot Type">
                  <Select
                    value={scene.camera.shotType}
                    onChange={(v) => patch({ camera: { ...scene.camera, shotType: v as Scene['camera']['shotType'] } })}
                    options={SHOT_TYPE_OPTIONS}
                  />
                </Field>
                <Field label="Movement">
                  <Select
                    value={scene.camera.movement}
                    onChange={(v) => patch({ camera: { ...scene.camera, movement: v as Scene['camera']['movement'] } })}
                    options={MOVEMENT_OPTIONS}
                  />
                </Field>
                <Field label="Lens">
                  <Select
                    value={scene.camera.lens}
                    onChange={(v) => patch({ camera: { ...scene.camera, lens: v as Scene['camera']['lens'] } })}
                    options={LENS_OPTIONS}
                  />
                </Field>
                <Field label="Angle">
                  <Select
                    value={scene.camera.angle}
                    onChange={(v) => patch({ camera: { ...scene.camera, angle: v as Scene['camera']['angle'] } })}
                    options={ANGLE_OPTIONS}
                  />
                </Field>
              </div>
            </div>

            <Field label="Visual">
              <TextArea
                value={scene.visual}
                onChange={(v) => patch({ visual: v })}
                placeholder="Describe exactly what the audience sees."
                showCount
              />
            </Field>

            <div
              ref={visualSectionRef}
              className={`rounded-lg border p-3 transition ${
                visualHighlight ? 'border-gold bg-gold-soft' : 'border-border bg-surface-2'
              }`}
            >
              <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-dim">
                <Wand2 size={12} />
                AI Storyboard Still
              </div>
              <p className="mb-2.5 text-[11px] leading-relaxed text-ink-faint">
                Generates a still from the Visual description above, plus this scene's camera direction and mood.
              </p>
              {scene.image && (
                <img
                  src={scene.image}
                  alt="Current scene still"
                  className="mb-2.5 h-24 w-full rounded-md object-cover"
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateVisual}
                  disabled={generatingImage}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[12px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-60"
                >
                  {generatingImage ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                  {generatingImage ? 'Generating…' : scene.image ? 'Regenerate' : 'Generate from description'}
                </button>
                {scene.image && !generatingImage && (
                  <button
                    onClick={() => void setSceneImage(episode.id, scene.id, null)}
                    className="rounded-lg border border-border px-2.5 py-2 text-ink-faint transition hover:border-red-400/40 hover:text-red-400"
                    title="Remove image"
                    aria-label="Remove image"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[11.5px] font-medium text-ink-dim">On Screen Text</div>
              <TextArea
                value={scene.onScreenText.text}
                onChange={(v) => patch({ onScreenText: { ...scene.onScreenText, text: v } })}
                placeholder="Editable text overlay"
                rows={2}
              />
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <Select
                  value={scene.onScreenText.font}
                  onChange={(v) => patch({ onScreenText: { ...scene.onScreenText, font: v } })}
                  options={FONT_OPTIONS}
                />
                <Select
                  value={scene.onScreenText.animation}
                  onChange={(v) => patch({ onScreenText: { ...scene.onScreenText, animation: v } })}
                  options={ANIMATION_OPTIONS}
                />
                <Select
                  value={scene.onScreenText.position}
                  onChange={(v) => patch({ onScreenText: { ...scene.onScreenText, position: v as Scene['onScreenText']['position'] } })}
                  options={['Top', 'Center', 'Bottom']}
                />
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={scene.onScreenText.duration}
                    onChange={(e) => patch({ onScreenText: { ...scene.onScreenText, duration: Number(e.target.value) } })}
                    className="w-full bg-transparent text-[13px] text-ink"
                  />
                  <span className="text-[11px] text-ink-faint">sec</span>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[11.5px] font-medium text-ink-dim">Tags</div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {scene.tags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-medium text-gold"
                  >
                    {t}
                    <button onClick={() => patch({ tags: scene.tags.filter((x) => x !== t) })}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  placeholder="Add tag and press Enter"
                  className="w-full bg-transparent text-[12.5px] text-ink placeholder:text-ink-faint"
                />
              </div>
            </div>
          </>
        )}

        {tab === 'Dialogue' && (
          <>
            <Field label="Dialogue">
              <TextArea
                value={scene.dialogue}
                onChange={(v) => updateSceneDialogue(episode.id, scene.id, v)}
                placeholder="What is said in this scene..."
                rows={6}
              />
              <div className="mt-1.5 text-[11px] text-ink-faint">
                {dialogueWordCount === 0
                  ? 'No dialogue — duration is set manually.'
                  : `${dialogueWordCount} word${dialogueWordCount === 1 ? '' : 's'} · ~${estimatedSeconds}s at ${paceLabel} pace`}
              </div>
            </Field>
            {scene.purpose === 'Hook' && (
              <HookWorkshop
                scene={scene}
                episode={episode}
                onApply={(line, hookType) => {
                  updateSceneDialogue(episode.id, scene.id, line)
                  patch({ hookType })
                }}
                onSetType={(hookType) => patch({ hookType })}
              />
            )}
            <Field label="Speaking Pace">
              <div className="relative">
                <select
                  value={scene.pace ?? ''}
                  onChange={(e) =>
                    setScenePace(episode.id, scene.id, e.target.value === '' ? undefined : (e.target.value as SpeakingPace))
                  }
                  className="w-full appearance-none rounded-lg border border-border bg-surface-2 px-3 py-2 pr-8 text-[13px] text-ink transition focus:border-gold"
                >
                  <option value="">
                    Use episode default (
                    {SPEAKING_PACE_OPTIONS.find((p) => p.value === (episode.defaultPace ?? DEFAULT_SPEAKING_PACE))?.label}
                    )
                  </option>
                  {SPEAKING_PACE_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label} ({p.wpm})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint" />
              </div>
            </Field>
            <div>
              <div className="mb-1.5 text-[11.5px] font-medium text-ink-dim">Actor Direction</div>
              <div className="flex flex-wrap gap-1.5">
                {ACTOR_DIRECTIONS.map((dir) => {
                  const active = scene.actorDirection.includes(dir)
                  return (
                    <button
                      key={dir}
                      onClick={() => toggleActorDirection(dir)}
                      className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition ${
                        active ? 'border-gold bg-gold-soft text-gold' : 'border-border text-ink-dim hover:border-ink-faint'
                      }`}
                    >
                      {dir}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {tab === 'Audio' && (
          <>
            <MusicPicker
              value={scene.audio.music}
              fileUrl={scene.audio.musicFileUrl}
              onChange={audio.onMusicChange}
              onUploadFile={audio.onMusicUploadFile}
              onRemoveFile={audio.onMusicRemoveFile}
              trimStart={scene.audio.musicTrimStart ?? 0}
              previewDuration={scene.end - scene.start}
            />
            {scene.audio.musicFileUrl && (
              <AudioRegionSelector
                fileUrl={scene.audio.musicFileUrl}
                sceneDuration={scene.end - scene.start}
                trimStart={scene.audio.musicTrimStart ?? 0}
                onChange={audio.onMusicTrimChange}
              />
            )}
            <SfxPicker
              selected={scene.audio.sfx}
              sceneDuration={scene.end - scene.start}
              onAdd={audio.onSfxAdd}
              onRemoveByName={audio.onSfxRemoveByName}
              onRemove={audio.onSfxRemove}
              onUpdate={audio.onSfxUpdate}
            />
            <Field label="Voice Over">
              <TextInput value={scene.audio.voiceOver} onChange={(v) => patch({ audio: { ...scene.audio, voiceOver: v } })} placeholder="VO line or 'Silence'" />
            </Field>
            <Field label="Mood">
              <TextInput value={scene.audio.mood} onChange={(v) => patch({ audio: { ...scene.audio, mood: v } })} placeholder="e.g. Tense curiosity" />
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-medium text-ink-dim">
                <span>Intensity</span>
                <span className="text-ink-faint">{scene.audio.intensity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={scene.audio.intensity}
                onChange={(e) => patch({ audio: { ...scene.audio, intensity: Number(e.target.value) } })}
                className="w-full accent-[var(--dos-gold)]"
              />
            </div>
            <Field label="Volume Notes">
              <TextArea value={scene.audio.volumeNotes} onChange={(v) => patch({ audio: { ...scene.audio, volumeNotes: v } })} rows={2} />
            </Field>
          </>
        )}

        {tab === 'Notes' && (
          <>
            <Field label="Retention Goal">
              <TextArea
                value={scene.retentionGoal}
                onChange={(v) => patch({ retentionGoal: v })}
                placeholder="Why does this scene exist? e.g. Creates curiosity, pays off the hook..."
                rows={3}
              />
            </Field>
            <Field label="Notes">
              <TextArea value={scene.notes} onChange={(v) => patch({ notes: v })} placeholder="Any other production notes..." rows={4} />
            </Field>
          </>
        )}

        {tab === 'AI Assets' && (
          <AssetsTab
            scene={scene}
            onAdd={(asset) => addSceneAsset(episode.id, scene.id, asset)}
            onUpdate={(assetId, p) => updateSceneAsset(episode.id, scene.id, assetId, p)}
            onRemove={(assetId) => removeSceneAsset(episode.id, scene.id, assetId)}
          />
        )}
      </div>

      <div className="border-t border-border-soft px-5 py-4">
        <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gold/40 bg-gold-soft py-2.5 text-[12.5px] font-medium text-gold transition hover:bg-gold/20">
          <Sparkles size={14} />
          AI Assistant
        </button>
      </div>
    </motion.div>
  )
}

function AssetsTab({
  scene,
  onAdd,
  onUpdate,
  onRemove,
}: {
  scene: Scene
  onAdd: (asset: Omit<SceneAsset, 'id'>) => void
  onUpdate: (assetId: string, patch: Partial<SceneAsset>) => void
  onRemove: (assetId: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [kind, setKind] = useState<string>(ASSET_KIND_OPTIONS[0])
  const [prompt, setPrompt] = useState('')

  function submit() {
    if (!prompt.trim()) return
    onAdd({ kind: kind as SceneAsset['kind'], prompt: prompt.trim(), status: 'Pending' })
    setPrompt('')
    setShowForm(false)
  }

  return (
    <div className="space-y-3">
      {scene.assets.length === 0 && !showForm && (
        <p className="text-[12.5px] text-ink-faint italic">No AI assets yet for this scene.</p>
      )}
      {scene.assets.map((asset) => (
        <div key={asset.id} className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-ink">{asset.kind}</span>
            <div className="flex items-center gap-2">
              <select
                value={asset.status}
                onChange={(e) => onUpdate(asset.id, { status: e.target.value as SceneAsset['status'] })}
                className="rounded-full border-none px-2 py-0.5 text-[10.5px] font-medium"
                style={{ backgroundColor: `${ASSET_STATUS_COLOR[asset.status]}20`, color: ASSET_STATUS_COLOR[asset.status] }}
              >
                {ASSET_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button onClick={() => onRemove(asset.id)} className="text-ink-faint hover:text-red-400">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-dim">{asset.prompt}</p>
        </div>
      ))}

      {showForm ? (
        <div className="rounded-lg border border-gold/40 bg-gold-soft p-3">
          <Select value={kind} onChange={setKind} options={ASSET_KIND_OPTIONS} />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the AI asset prompt..."
            rows={3}
            className="mt-2 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-faint"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-2.5 py-1.5 text-[12px] text-ink-dim">
              Cancel
            </button>
            <button onClick={submit} className="rounded-md bg-gold px-3 py-1.5 text-[12px] font-medium text-[#141316]">
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-[12.5px] text-ink-dim transition hover:border-gold hover:text-gold"
        >
          <Plus size={14} />
          Add AI Asset
        </button>
      )}
    </div>
  )
}
