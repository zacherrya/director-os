import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { hydrateStoredFiles, useAppStore } from '../store/appStore'
import { buildBackup, downloadBackup, restoreBackup } from '../lib/backup'
import { toast } from '../lib/toast'
import { FEATURE_LABEL, totalThisMonth, usageThisMonth } from '../lib/aiUsage'
import { connectGoogle, disconnectGoogle } from '../lib/googleAuth'
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getInstagramToken,
  getOpenAiKey,
  getYouTubeChannel,
  getYouTubeKey,
  canUploadToYouTube,
  hasGoogleAuth,
  setGoogleClientId,
  setGoogleClientSecret,
  setInstagramToken,
  setOpenAiKey,
  setYouTubeChannel,
  setYouTubeKey,
} from '../lib/credentials'
import { Check, Icon, Loader2, Settings, X } from './Icon'
import { useEscapeKey } from '../lib/useEscapeKey'

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  secret = true,
  link,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  secret?: boolean
  link?: { href: string; label: string }
}) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-[12.5px] font-medium text-ink">{label}</label>
      <p className="mb-2 text-[11.5px] leading-relaxed text-ink-faint">{hint}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={secret ? 'password' : 'text'}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:border-gold"
      />
      {link && (
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-block text-[11px] text-ink-faint underline decoration-dotted hover:text-ink-dim"
        >
          {link.label}
        </a>
      )}
    </div>
  )
}

/**
 * Optional second YouTube connection. The API key reads public statistics; this
 * one reads the analytics only the channel owner can see — traffic sources, the
 * retention curve, and which videos are suggesting yours.
 */
function GoogleAuthSection() {
  const [clientId, setClientId] = useState(getGoogleClientId())
  const [clientSecret, setClientSecret] = useState(getGoogleClientSecret())
  const [connected, setConnected] = useState(hasGoogleAuth())
  // A connection made before uploading existed keeps working for analytics but
  // cannot publish, so it needs saying rather than failing later at the upload.
  const [canUpload, setCanUpload] = useState(canUploadToYouTube())
  const [busy, setBusy] = useState(false)

  async function handleConnect() {
    setBusy(true)
    try {
      // Persist first: the consent flow reads them back from storage, and a
      // half-finished connect shouldn't lose what was typed.
      setGoogleClientId(clientId)
      setGoogleClientSecret(clientSecret)
      await connectGoogle()
      setConnected(true)
      setCanUpload(canUploadToYouTube())
      toast.success('YouTube Analytics connected.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not connect.')
    } finally {
      setBusy(false)
    }
  }

  function handleDisconnect() {
    disconnectGoogle()
    setConnected(false)
    setCanUpload(false)
    toast.success('Disconnected. Revoke access in your Google account to remove it fully.')
  }

  return (
    <div className="mt-5 border-t border-border-soft pt-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[12.5px] font-medium text-ink">Deeper analytics</span>
        {connected && (
          <span className="flex items-center gap-1 rounded-full bg-[#6bb15a]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#6bb15a]">
            <Check size={9} /> Connected
          </span>
        )}
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-faint">
        Traffic sources, the real retention curve, which videos are suggesting yours — and uploading a
        finished cut. Needs an OAuth client because these are private to the channel owner; the API key
        above cannot reach them. Director OS asks for read-only analytics and permission to upload, which
        does not let it edit or delete anything already on your channel.
      </p>

      {connected && !canUpload && (
        <div className="mb-3 rounded-lg border border-gold/40 bg-gold-soft px-3 py-2.5">
          <p className="text-[11.5px] leading-relaxed text-ink-dim">
            This connection was made before uploading existed, so it only covers analytics. Disconnect and
            connect again to grant upload permission — nothing else changes.
          </p>
        </div>
      )}

      {!connected && (
        <>
          <Field
            label="OAuth client ID"
            hint="Google Cloud Console → Credentials → Create credentials → OAuth client ID → Desktop app."
            value={clientId}
            onChange={setClientId}
            placeholder="…apps.googleusercontent.com"
            secret={false}
            link={{ href: 'https://console.cloud.google.com/apis/credentials', label: 'Open the credentials console' }}
          />
          <Field
            label="OAuth client secret"
            hint="Shown alongside the client ID when you create it."
            value={clientSecret}
            onChange={setClientSecret}
            placeholder="GOCSPX-…"
          />
        </>
      )}

      <div className="flex justify-end">
        {connected ? (
          <button
            onClick={handleDisconnect}
            className="rounded-lg border border-border px-3.5 py-1.5 text-[12.5px] font-medium text-ink-dim transition hover:border-ink-faint hover:text-ink"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={busy || !clientId.trim() || !clientSecret.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-1.5 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-50"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {busy ? 'Waiting for Google…' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  )
}

const TABS = ['AI', 'Instagram', 'YouTube', 'Data'] as const

const TAB_ICON: Record<(typeof TABS)[number], string> = {
  AI: 'sparkles',
  Instagram: 'camera',
  YouTube: 'film',
  Data: 'layers',
}
type Tab = (typeof TABS)[number]

/** Counts, not dollars — only OpenAI knows the real figure, and a guessed number
 * next to a currency symbol gets trusted more than it deserves. */
function UsageThisMonth() {
  const rows = usageThisMonth().filter((r) => r.count > 0)
  const total = totalThisMonth()

  return (
    <div className="mt-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="mb-1.5 text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">
        AI calls this month
      </div>
      {total === 0 ? (
        <p className="text-[11.5px] text-ink-faint">Nothing yet this month.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.feature} className="flex justify-between text-[11.5px]">
              <span className="text-ink-dim">{FEATURE_LABEL[r.feature]}</span>
              <span className="tabular-nums text-ink">{r.count}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-border-soft pt-1 text-[11.5px] font-medium">
            <span className="text-ink-dim">Total</span>
            <span className="tabular-nums text-ink">{total}</span>
          </div>
        </div>
      )}
      <a
        href="https://platform.openai.com/usage"
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-[11px] text-ink-faint underline decoration-dotted hover:text-ink-dim"
      >
        See actual spend on platform.openai.com
      </a>
    </div>
  )
}

function DataTab() {
  const store = useAppStore()
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setBusy('export')
    try {
      const backup = await buildBackup({
        projects: store.projects,
        episodes: store.episodes,
        assets: store.assets,
        patterns: store.patterns,
        playbook: store.playbook,
      })
      downloadBackup(backup)
      toast.success('Workspace backup saved.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed.')
    } finally {
      setBusy(null)
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (
      !window.confirm(
        'Restoring replaces every project, episode and rule currently in Director OS. Continue?',
      )
    ) {
      return
    }
    setBusy('import')
    try {
      const restored = await restoreBackup(await file.text())
      store.loadWorkspace({
        projects: restored.projects,
        episodes: restored.episodes,
        assets: restored.assets,
        patterns: restored.patterns,
        playbook: restored.playbook,
      })
      // Rebind blob: URLs for the restored media straight away, so images and
      // audio work immediately instead of only after a relaunch.
      await hydrateStoredFiles()
      toast.success('Workspace restored.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed.')
    } finally {
      setBusy(null)
    }
  }

  const liveEpisodes = store.episodes.filter((ep) => !ep.deletedAt)
  const sceneCount = liveEpisodes.reduce((n, ep) => n + ep.scenes.length, 0)

  return (
    <div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-faint">
        Everything you plan lives on this machine only. A backup is the one thing standing between a
        cleared browser store and losing all of it — take one before any big change.
      </p>
      <div className="mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[11.5px] text-ink-dim">
        {store.projects.filter((p) => !p.deletedAt).length} projects · {liveEpisodes.length} episodes ·{' '}
        {sceneCount} scenes · {store.playbook.length} rules
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={busy !== null}
          className="flex-1 rounded-lg bg-gold px-3 py-2 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright disabled:opacity-60"
        >
          {busy === 'export' ? 'Exporting…' : 'Export backup'}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          className="flex-1 rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-ink-dim transition hover:border-ink-faint hover:text-ink disabled:opacity-60"
        >
          {busy === 'import' ? 'Restoring…' : 'Restore backup'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
    </div>
  )
}

export function SettingsModal({ onClose, initialTab = 'AI' }: { onClose: () => void; initialTab?: Tab }) {
  useEscapeKey(onClose)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [openAi, setOpenAi] = useState(getOpenAiKey())
  const [igToken, setIgToken] = useState(getInstagramToken())
  const [ytKey, setYtKey] = useState(getYouTubeKey())
  const [ytChannel, setYtChannel] = useState(getYouTubeChannel())
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setOpenAiKey(openAi)
    setInstagramToken(igToken)
    setYouTubeKey(ytKey)
    setYouTubeChannel(ytChannel)
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        /* Capped and column-flexed so the body can scroll. Without the cap the
           panel simply grew past the viewport and the fields at the bottom —
           the newest ones, every time — became unreachable. */
        className="flex max-h-[86vh] w-[min(760px,94vw)] flex-col overflow-hidden rounded-xl border border-border bg-elevated shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-soft text-gold">
              <Settings size={15} />
            </div>
            <span className="text-[14px] font-medium text-ink">Settings</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md p-1 text-ink-faint transition hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} />
          </button>
        </header>

        {/* min-h-0 is what actually lets the body scroll inside a flex column. */}
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Settings sections"
            className="flex w-[164px] shrink-0 flex-col gap-0.5 border-r border-border-soft p-3"
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-current={tab === t ? 'page' : undefined}
                /* A gold rail, not just a tint: gold-soft is only 12% alpha, so
                   the selected item read *weaker* than a hovered one and the
                   selection was ambiguous the moment the cursor moved. */
                className={`flex items-center gap-2 rounded-r-lg border-l-2 py-2 pr-2.5 pl-2 text-left text-[12.5px] transition ${
                  tab === t
                    ? 'border-gold bg-gold-soft font-semibold text-gold'
                    : 'border-transparent font-medium text-ink-dim hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <Icon name={TAB_ICON[t]} size={14} />
                {t}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
            {tab === 'AI' && (
              <>
                <Field
                  label="OpenAI API key"
                  hint="Generates storyboard stills and powers the performance analysis on the Analytics page. Usage is billed to your OpenAI account."
                  value={openAi}
                  onChange={setOpenAi}
                  placeholder="sk-..."
                  link={{
                    href: 'https://platform.openai.com/api-keys',
                    label: 'Get a key from platform.openai.com',
                  }}
                />
                <UsageThisMonth />
              </>
            )}

            {tab === 'Instagram' && (
              <>
                <Field
                  label="Instagram access token"
                  hint="A long-lived token from the Instagram Login flow on your own Meta app. Read-only — Director OS never requests publishing permission, so it cannot post to your account."
                  value={igToken}
                  onChange={setIgToken}
                  placeholder="IGAA..."
                  link={{
                    href: 'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login',
                    label: 'Meta setup guide for Instagram Login',
                  }}
                />
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  Tokens last 60 days and need refreshing. Audience demographics stay locked by Meta until
                  the account passes 100 followers.
                </p>

                <div className="mt-5 border-t border-border-soft pt-4">
                  <div className="mb-1 text-[12.5px] font-medium text-ink">Publishing</div>
                  <p className="text-[11.5px] leading-relaxed text-ink-faint">
                    Not set up, deliberately. Posting a reel from an app is offered only on Meta's Facebook
                    Login path, which needs a different app setup and permissions your app does not offer —
                    <span className="text-ink-dim"> instagram_basic</span> and{' '}
                    <span className="text-ink-dim">instagram_content_publish</span> never appear in the Graph
                    API Explorer for an app built on Instagram Login. The token above reads analytics and
                    nothing else; captions are written on the Post tab and copied across by hand.
                  </p>
                </div>
              </>
            )}

            {tab === 'YouTube' && (
              <>
                <Field
                  label="YouTube Data API key"
                  hint="Create a project in Google Cloud, enable YouTube Data API v3, then make an API key. No OAuth needed — this reads public statistics only."
                  value={ytKey}
                  onChange={setYtKey}
                  placeholder="AIza..."
                  link={{
                    href: 'https://console.cloud.google.com/apis/credentials',
                    label: 'Google Cloud credentials console',
                  }}
                />
                <Field
                  label="Channel"
                  hint="Your @handle or your UC… channel id."
                  value={ytChannel}
                  onChange={setYtChannel}
                  placeholder="@yourchannel"
                  secret={false}
                />
                <GoogleAuthSection />
              </>
            )}

            {tab === 'Data' && <DataTab />}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-5 py-3">
          <p className="flex min-w-0 flex-1 items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
            <Icon name="wand-2" size={12} className="mt-0.5 shrink-0" />
            Everything here stays on this machine, and is only ever sent to the service it belongs to.
          </p>
          {tab !== 'Data' && (
            <button
              onClick={handleSave}
              className="shrink-0 rounded-lg bg-gold px-4 py-1.5 text-[12.5px] font-medium text-[#141316] transition hover:bg-gold-bright"
            >
              {saved ? 'Saved' : 'Save'}
            </button>
          )}
        </footer>
      </motion.div>
    </div>
  )
}
