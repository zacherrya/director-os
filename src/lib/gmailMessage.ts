/**
 * Turning a proposal into an RFC 2822 message Gmail will accept.
 *
 * Kept free of any network or Tauri import so it can be tested directly, which
 * matters more here than elsewhere: an email is the one thing this app produces
 * that cannot be taken back once it leaves.
 *
 * Two things are non-negotiable in here. Header values are stripped of CR and LF
 * before they are written, because a newline inside a name or a subject would
 * let anything after it become a header of its own — a Bcc, a Reply-To — and a
 * contact's name is user-entered text that has passed through no validation at
 * all. And anything outside plain ASCII is encoded rather than sent raw, so an
 * Indian brand name or a curly apostrophe arrives intact instead of as mojibake.
 */

export interface Draft {
  /** A single address. Groups and comma lists are deliberately not supported. */
  to: string
  subject: string
  /** Plain text. Paragraphs separated by blank lines, as `buildPitch` returns. */
  body: string
  /** Optional display name for the recipient, e.g. "Priya Sharma". */
  toName?: string
}

/** Anything that could start a new header line, removed. */
export function sanitizeHeader(value: string): string {
  // Matching control characters is the entire job here — CR and LF are what a
  // header injection is made of, and NUL truncates the header in some agents.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u000D\u000A\u0000]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * A deliberately plain check. This is not trying to be the full RFC 5322
 * grammar — it is trying to catch the address that will bounce, and to refuse
 * anything carrying a newline.
 */
export function isSendableAddress(value: string): boolean {
  const v = value.trim()
  if (!v || /[\s<>,;"\\]/.test(v)) return false
  const at = v.indexOf('@')
  if (at < 1 || at !== v.lastIndexOf('@')) return false
  const domain = v.slice(at + 1)
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.') && domain.length > 3
}

const isAscii = (s: string) => !/[^\x20-\x7E]/.test(s)

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // A spread would blow the argument limit on a long pitch.
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

const utf8 = (s: string) => new TextEncoder().encode(s)

/** RFC 2047, so a non-ASCII subject survives the trip. */
export function encodeHeaderValue(value: string): string {
  const clean = sanitizeHeader(value)
  return isAscii(clean) ? clean : `=?UTF-8?B?${toBase64(utf8(clean))}?=`
}

/** `Name <address>`, with the name quoted or encoded as needed. */
export function formatRecipient(address: string, name?: string): string {
  const addr = sanitizeHeader(address)
  const display = name ? sanitizeHeader(name) : ''
  if (!display) return addr
  return isAscii(display)
    ? `"${display.replace(/"/g, '')}" <${addr}>`
    : `${encodeHeaderValue(display)} <${addr}>`
}

/** Base64 bodies are conventionally wrapped; some servers baulk at long lines. */
function wrap(value: string, at = 76): string {
  const lines: string[] = []
  for (let i = 0; i < value.length; i += at) lines.push(value.slice(i, i + at))
  return lines.join('\r\n')
}

/**
 * The full message. Base64 for the body rather than quoted-printable: the pitch
 * is prose with curly quotes and rupee signs in it, and base64 has no escaping
 * rules to get subtly wrong.
 */
export function buildRawMessage(draft: Draft): string {
  const to = sanitizeHeader(draft.to)
  if (!isSendableAddress(to)) throw new Error(`"${to || 'empty'}" is not an address this can send to.`)

  const headers = [
    `To: ${formatRecipient(to, draft.toName)}`,
    `Subject: ${encodeHeaderValue(draft.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ]
  return `${headers.join('\r\n')}\r\n\r\n${wrap(toBase64(utf8(draft.body)))}`
}

/** What the Gmail API wants in `raw`: base64url, unpadded. */
export function encodeForGmail(draft: Draft): string {
  return toBase64(utf8(buildRawMessage(draft)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * The subject line. Leads with the idea, because that is the part a partnerships
 * manager is deciding whether to open — not the creator's name, and not the word
 * "collaboration" on its own, which is what every other pitch in the inbox says.
 */
export function proposalSubject(idea: string, brandName?: string): string {
  const title = sanitizeHeader(idea)
  const brand = brandName ? sanitizeHeader(brandName) : ''
  if (title && brand) return `${title} — a collaboration idea for ${brand}`
  if (title) return title
  if (brand) return `A collaboration idea for ${brand}`
  return 'A collaboration idea'
}
