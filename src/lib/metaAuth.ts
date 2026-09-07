/**
 * Facebook Login for Business, for publishing to Instagram.
 *
 * This is a second, separate Meta connection from the Instagram Login token used
 * for analytics, and it exists for one reason: Meta's resumable upload — the only
 * way to publish a Reel without first putting the video at a public URL — is
 * available *only* to apps using Facebook Login. The Instagram Login path can
 * publish, but solely by handing Meta a URL to fetch.
 *
 * Deliberately not an OAuth redirect flow. Meta enforces HTTPS on redirect URIs
 * for every app created since 2018 and matches them exactly, and its handling of
 * loopback addresses for Business Login is undocumented and inconsistent — the
 * first attempt at it was refused with "the domain of this URL does not include
 * the domain of the app". Rather than fight that, the user pastes a short-lived
 * token from Meta's own Graph API Explorer and the app does the rest.
 *
 * The result is better, not merely easier. Exchanging that token for a long-lived
 * one and then reading the Pages yields a **Page token that does not expire**, so
 * this is a one-time paste rather than the 60-day refresh the analytics token
 * needs. The order matters: a Page token inherits its lifetime from the user
 * token it came from, so the exchange has to happen before `/me/accounts`.
 */

import { fetch } from '@tauri-apps/plugin-http'
import {
  getMetaAppId,
  getMetaAppSecret,
  setInstagramPageToken,
  setInstagramUserId,
  setInstagramAccountName,
} from './credentials'

export const GRAPH_VERSION = 'v23.0'
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`

/** What the pasted token has to have been granted. Checked, not assumed. */
export const REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
]

interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number }
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), { headers: { accept: 'application/json' } })
  const text = await res.text()

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`Meta returned a non-JSON response (HTTP ${res.status}).`)
  }

  const err = (body as GraphError).error
  if (!res.ok || err) {
    if (err?.code === 190) {
      throw new Error('Meta rejected the saved token — it expired or was revoked. Reconnect in Settings.')
    }
    throw new Error(err?.message ?? `Meta request failed (HTTP ${res.status}).`)
  }
  return body as T
}

export interface ConnectedAccount {
  igUserId: string
  username: string
  pageName: string
}

/**
 * Runs consent, then walks Page → Instagram account and stores what publishing
 * needs. Resolves with what was connected so the UI can name it.
 */
export async function connectMeta(userToken: string): Promise<ConnectedAccount> {
  const appId = getMetaAppId()
  const appSecret = getMetaAppSecret()
  if (!appId || !appSecret) {
    throw new Error('Add your Meta app ID and secret in Settings first.')
  }
  const pasted = userToken.trim()
  if (!pasted) throw new Error('Paste the access token from the Graph API Explorer first.')

  // Fail on a missing permission here, with its name, rather than at publish
  // time with a bare "(#200) Permissions error".
  const granted = await graph<{ data?: { scopes?: string[] } }>('/debug_token', {
    input_token: pasted,
    access_token: `${appId}|${appSecret}`,
  }).catch(() => null)

  const scopes = granted?.data?.scopes
  if (scopes) {
    const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s))
    if (missing.length > 0) {
      throw new Error(
        `That token is missing ${missing.join(', ')}. Tick those permissions in the Graph API Explorer and generate it again.`,
      )
    }
  }

  // Short-lived → long-lived, before reading the Pages: a Page token inherits
  // its lifetime from the user token it came from, and only one derived from a
  // long-lived token is permanent.
  const long = await graph<{ access_token: string }>('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: pasted,
  })

  // 3. Which Pages can this person manage?
  const pages = await graph<{ data?: { id: string; name: string; access_token: string }[] }>(
    '/me/accounts',
    { access_token: long.access_token, fields: 'id,name,access_token' },
  )
  const candidates = pages.data ?? []
  if (candidates.length === 0) {
    throw new Error(
      'That account manages no Facebook Pages. An Instagram professional account has to be linked to a Page before it can publish through the API.',
    )
  }

  // 4. Which of them has an Instagram account attached?
  for (const page of candidates) {
    const detail = await graph<{ instagram_business_account?: { id: string; username?: string } }>(
      `/${page.id}`,
      { access_token: page.access_token, fields: 'instagram_business_account{id,username}' },
    )
    const ig = detail.instagram_business_account
    if (!ig?.id) continue

    setInstagramPageToken(page.access_token)
    setInstagramUserId(ig.id)
    const username = ig.username ?? 'your account'
    setInstagramAccountName(username)
    return { igUserId: ig.id, username, pageName: page.name }
  }

  throw new Error(
    `None of your Pages (${candidates.map((p) => p.name).join(', ')}) has an Instagram professional account linked. Link it in the Page's settings, then reconnect.`,
  )
}

export function disconnectMeta(): void {
  setInstagramPageToken('')
  setInstagramUserId('')
  setInstagramAccountName('')
}

/** A Graph call on behalf of the connected Page. */
export async function graphGet<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  return graph<T>(path, { ...params, access_token: token })
}

export async function graphPost<T>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const url = new URL(`${GRAPH}${path}`)
  const body = new URLSearchParams({ ...params, access_token: token })

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const text = await res.text()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Meta returned a non-JSON response (HTTP ${res.status}).`)
  }
  const err = (parsed as GraphError).error
  if (!res.ok || err) {
    if (err?.code === 190) {
      throw new Error('Meta rejected the saved token — it expired or was revoked. Reconnect in Settings.')
    }
    throw new Error(err?.message ?? `Meta request failed (HTTP ${res.status}).`)
  }
  return parsed as T
}
