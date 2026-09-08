/**
 * Sending a proposal through the user's own Gmail account.
 *
 * This reuses the Google connection that already exists for YouTube rather than
 * opening a second one — same client, same refresh token, one more scope. A
 * connection made before sending existed holds only the older scopes and keeps
 * working, so callers check `canSendGmail()` instead of assuming.
 *
 * Sending goes through the Gmail API rather than SMTP for one reason that
 * matters after the fact: the message lands in the account's own Sent folder and
 * threads properly, so the brand's reply arrives in the same conversation and
 * the follow-up is where the user expects it. SMTP with an app password would be
 * easier to set up and would leave no trace of what was sent.
 *
 * Nothing here retries. A send that fails is a send that did not happen, and an
 * automatic second attempt at an email is how a brand receives the same pitch
 * twice.
 */

import { fetch } from '@tauri-apps/plugin-http'
import { getAccessToken } from './googleAuth'
import { canSendGmail } from './credentials'
import { encodeForGmail, type Draft } from './gmailMessage'

const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

export interface SentMessage {
  id: string
  threadId: string
}

interface GmailError {
  error?: { message?: string; status?: string; code?: number }
}

/**
 * Sends one message. Resolves only once Gmail has accepted it, so a caller can
 * record "sent" on the strength of this returning.
 */
export async function sendProposal(draft: Draft): Promise<SentMessage> {
  if (!canSendGmail()) {
    throw new Error('Gmail sending is not connected. Connect Google in Settings and allow sending.')
  }

  const token = await getAccessToken()

  let res: Awaited<ReturnType<typeof fetch>>
  try {
    res = await fetch(SEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw: encodeForGmail(draft) }),
    })
  } catch (err) {
    // Tauri refuses any host missing from the HTTP capability allowlist, and
    // says so in terms that read like a Google problem when it is ours. Name it,
    // because the fix is in this repo rather than in anyone's Google account.
    const message = err instanceof Error ? err.message : String(err)
    if (/not allowed|forbidden|scope/i.test(message)) {
      throw new Error(
        'Director OS is not allowed to reach the Gmail API. That is a build setting in this app, not a Google permission — gmail.googleapis.com has to be in src-tauri/capabilities.',
      )
    }
    throw new Error(`Could not reach Gmail: ${message}`)
  }

  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`Gmail returned a non-JSON response (HTTP ${res.status}).`)
  }

  if (!res.ok) {
    const failure = (body as GmailError).error
    // The two failures worth naming, because both have a specific fix and the
    // raw text of neither says what it is.
    if (res.status === 403 && /insufficient|scope/i.test(failure?.message ?? '')) {
      throw new Error('Google has not granted sending. Reconnect in Settings and tick the send permission.')
    }
    if (res.status === 429) {
      throw new Error('Gmail is rate limiting this account. Wait a few minutes and send again.')
    }
    throw new Error(failure?.message ?? `Gmail refused the message (HTTP ${res.status}).`)
  }

  const sent = body as Partial<SentMessage>
  if (!sent.id) throw new Error('Gmail accepted the request but returned no message id.')
  return { id: sent.id, threadId: sent.threadId ?? sent.id }
}
