/**
 * Google OAuth for YouTube (loopback + PKCE).
 *
 * Two scopes: read-only analytics, and permission to upload a video. Neither
 * allows editing or deleting anything already on the channel — that would need
 * `youtube.force-ssl`, which is deliberately not requested.
 *
 * A connection made before uploading existed holds only the analytics scope and
 * keeps working, so callers check `canUploadToYouTube()` rather than assuming
 * this list was granted.
 *
 * The access token is deliberately kept in memory only. The refresh token is the
 * durable credential and lives in localStorage with the others; a short-lived
 * access token written to disk buys nothing and widens what a stray backup or
 * screen-share can leak.
 */

import { fetch } from '@tauri-apps/plugin-http'
import { invoke } from '@tauri-apps/api/core'
import {
  setGoogleScopes,
  UPLOAD_SCOPE,
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRefreshToken,
  setGoogleRefreshToken,
} from './credentials'

/**
 * Read-only analytics, plus the ability to upload a video — and nothing else.
 * Notably absent is `youtube.force-ssl`, which would also allow editing and
 * deleting anything already on the channel.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  UPLOAD_SCOPE,
].join(' ')
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
/** Refresh a little early rather than racing the expiry on a slow request. */
const EXPIRY_MARGIN_MS = 60_000

let accessToken: string | null = null
let accessTokenExpiry = 0
/** Collapses concurrent callers onto one refresh instead of three. */
let inFlight: Promise<string> | null = null

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function makePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const random = new Uint8Array(32)
  crypto.getRandomValues(random)
  const verifier = base64Url(random)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

interface TokenResponse {
  scope?: string
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  const text = await res.text()

  let payload: TokenResponse
  try {
    payload = JSON.parse(text) as TokenResponse
  } catch {
    throw new Error(`Google returned a non-JSON response (HTTP ${res.status}).`)
  }
  if (payload.error) {
    if (payload.error === 'invalid_grant') {
      throw new Error(
        'Google rejected the saved permission — it was revoked, or expired after 7 days of an app left in Testing. Reconnect in Settings.',
      )
    }
    throw new Error(payload.error_description ?? payload.error)
  }
  return payload
}

/**
 * Runs the full consent flow. Resolves once a refresh token is stored.
 *
 * The port isn't known until the socket is bound, and the redirect URI has to
 * contain it, so the bind has to happen before the URL is built.
 */
export async function connectGoogle(): Promise<void> {
  const clientId = getGoogleClientId()
  const clientSecret = getGoogleClientSecret()
  if (!clientId || !clientSecret) {
    throw new Error('Add your Google OAuth client ID and secret in Settings first.')
  }

  const port = await invoke<number>('oauth_bind')
  const redirectUri = `http://127.0.0.1:${port}`
  const { verifier, challenge } = await makePkcePair()

  const url = new URL(AUTH_ENDPOINT)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  // Without both of these Google withholds the refresh token on re-consent,
  // and the connection silently lasts one hour.
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')

  await invoke('oauth_open', { url: url.toString() })
  const code = await invoke<string>('oauth_await')

  const tokens = await postToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  })

  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token. Remove Director OS from your Google account permissions and try again.')
  }
  setGoogleRefreshToken(tokens.refresh_token)
  // Record what was actually granted — the consent screen lets a user tick only
  // some of what was asked for.
  setGoogleScopes(tokens.scope ?? SCOPES)
  if (tokens.access_token) {
    accessToken = tokens.access_token
    accessTokenExpiry = Date.now() + (tokens.expires_in ?? 3600) * 1000
  }
}

export function disconnectGoogle(): void {
  setGoogleRefreshToken('')
  setGoogleScopes('')
  accessToken = null
  accessTokenExpiry = 0
}

/** A valid access token, refreshing only when the cached one is close to expiry. */
export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessTokenExpiry - EXPIRY_MARGIN_MS) return accessToken
  if (inFlight) return inFlight

  const refresh = getGoogleRefreshToken()
  if (!refresh) throw new Error('YouTube Analytics is not connected. Connect it in Settings.')

  inFlight = (async () => {
    try {
      const tokens = await postToken({
        refresh_token: refresh,
        client_id: getGoogleClientId(),
        client_secret: getGoogleClientSecret(),
        grant_type: 'refresh_token',
      })
      if (!tokens.access_token) throw new Error('Google did not return an access token.')
      accessToken = tokens.access_token
      accessTokenExpiry = Date.now() + (tokens.expires_in ?? 3600) * 1000
      return accessToken
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}
