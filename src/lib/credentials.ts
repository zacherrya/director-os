/**
 * All third-party credentials the app holds, in one place.
 *
 * These live in localStorage on this machine only. They are never sent anywhere
 * except directly to the API each one belongs to, over the Tauri HTTP plugin
 * (whose allowlist in `src-tauri/capabilities/default.json` is what actually
 * enforces which hosts can be reached).
 */

const KEYS = {
  openAi: 'director-os-openai-key',
  instagramToken: 'director-os-ig-token',
  youtubeKey: 'director-os-yt-key',
  youtubeChannel: 'director-os-yt-channel',
  googleClientId: 'director-os-google-client-id',
  googleClientSecret: 'director-os-google-client-secret',
  googleRefreshToken: 'director-os-google-refresh',
  googleScopes: 'director-os-google-scopes',
  metaAppId: 'director-os-meta-app-id',
  metaAppSecret: 'director-os-meta-app-secret',
  instagramPageToken: 'director-os-ig-page-token',
  instagramUserId: 'director-os-ig-user-id',
  instagramAccountName: 'director-os-ig-account',
} as const

type CredentialName = keyof typeof KEYS

function read(name: CredentialName): string {
  try {
    return localStorage.getItem(KEYS[name]) ?? ''
  } catch {
    return ''
  }
}

function write(name: CredentialName, value: string) {
  try {
    const trimmed = value.trim()
    if (trimmed) localStorage.setItem(KEYS[name], trimmed)
    else localStorage.removeItem(KEYS[name])
  } catch {
    // A blocked localStorage just means the credential doesn't persist; the
    // caller's own "not connected" handling covers the consequences.
  }
}

export const getOpenAiKey = () => read('openAi')
export const setOpenAiKey = (v: string) => write('openAi', v)
export const hasOpenAiKey = () => getOpenAiKey().length > 0

export const getInstagramToken = () => read('instagramToken')
export const setInstagramToken = (v: string) => write('instagramToken', v)
export const hasInstagramToken = () => getInstagramToken().length > 0

export const getYouTubeKey = () => read('youtubeKey')
export const setYouTubeKey = (v: string) => write('youtubeKey', v)

/** A channel id (UC…), an @handle, or a bare handle — resolved at fetch time. */
export const getYouTubeChannel = () => read('youtubeChannel')
export const setYouTubeChannel = (v: string) => write('youtubeChannel', v)

export const hasYouTube = () => getYouTubeKey().length > 0 && getYouTubeChannel().length > 0

/**
 * Facebook Login for Business — a second Meta connection, used only to publish.
 *
 * Separate from the Instagram Login token above on purpose: analytics works fine
 * on that one, but Meta's direct video upload is offered only to apps using
 * Facebook Login. Without this, publishing a Reel would mean first putting the
 * video at a public URL.
 *
 * The stored token is a Page token derived from a long-lived user token, which
 * does not expire — so unlike the Instagram Login token there is nothing here to
 * refresh every 60 days.
 */
export const getMetaAppId = () => read('metaAppId')
export const setMetaAppId = (v: string) => write('metaAppId', v)

export const getMetaAppSecret = () => read('metaAppSecret')
export const setMetaAppSecret = (v: string) => write('metaAppSecret', v)

export const getInstagramPageToken = () => read('instagramPageToken')
export const setInstagramPageToken = (v: string) => write('instagramPageToken', v)

export const getInstagramUserId = () => read('instagramUserId')
export const setInstagramUserId = (v: string) => write('instagramUserId', v)

export const getInstagramAccountName = () => read('instagramAccountName')
export const setInstagramAccountName = (v: string) => write('instagramAccountName', v)

/** App credentials entered, but consent not yet granted. */
export const canConnectMeta = () => getMetaAppId().length > 0 && getMetaAppSecret().length > 0

/** Ready to publish a Reel. */
export const canPublishToInstagram = () =>
  getInstagramPageToken().length > 0 && getInstagramUserId().length > 0

/**
 * Google OAuth, used only for the YouTube Analytics API — traffic sources,
 * retention and the suggesting-video neighbourhood, none of which the plain
 * API key can reach.
 *
 * The "secret" of a Desktop-app OAuth client isn't really confidential (Google
 * documents it as such, which is why PKCE is mandatory here), but it still
 * belongs to the user's own Cloud project, so it stays on this machine like
 * every other credential.
 */
export const getGoogleClientId = () => read('googleClientId')
export const setGoogleClientId = (v: string) => write('googleClientId', v)

export const getGoogleClientSecret = () => read('googleClientSecret')
export const setGoogleClientSecret = (v: string) => write('googleClientSecret', v)

export const getGoogleRefreshToken = () => read('googleRefreshToken')
export const setGoogleRefreshToken = (v: string) => write('googleRefreshToken', v)

/** Credentials are entered but consent hasn't been granted yet. */
export const canConnectGoogle = () =>
  getGoogleClientId().length > 0 && getGoogleClientSecret().length > 0

/** Consent granted — the Analytics API is reachable. */
export const hasGoogleAuth = () => canConnectGoogle() && getGoogleRefreshToken().length > 0

/**
 * What Google actually granted, recorded at consent time.
 *
 * A saved connection from before uploading existed carries only the analytics
 * scope, and the refresh token keeps working — so the app has to check what it
 * was given rather than assume the current scope list applies.
 */
export const getGoogleScopes = () => read('googleScopes')
export const setGoogleScopes = (v: string) => write('googleScopes', v)

export const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload'

export const canUploadToYouTube = () =>
  hasGoogleAuth() && getGoogleScopes().split(/\s+/).includes(UPLOAD_SCOPE)
