import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRawMessage, encodeForGmail, encodeHeaderValue, formatRecipient,
  isSendableAddress, proposalSubject, sanitizeHeader,
} from '../src/lib/gmailMessage.ts'

const CRLF = '\r\n'
const decode = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
const bodyOf = (message) => {
  const body = message.split(CRLF + CRLF)[1]
  return Buffer.from(body.split(CRLF).join(''), 'base64').toString('utf8')
}

/* ------------------------------------------------------- header injection --- */

test('a newline in a name cannot open a header of its own', () => {
  const msg = buildRawMessage({
    to: 'priya@aurelia.com',
    toName: 'Priya' + CRLF + 'Bcc: everyone@rival.com',
    subject: 'Hello',
    body: 'Hi',
  })
  assert.ok(!/^Bcc:/im.test(msg), 'Bcc was injected through the display name')
  assert.equal(msg.split(CRLF).filter((l) => l.startsWith('To: ')).length, 1)
})

test('a newline in the subject cannot open a header of its own', () => {
  const msg = buildRawMessage({
    to: 'priya@aurelia.com',
    subject: 'Idea\nReply-To: attacker@example.com',
    body: 'Hi',
  })
  // The text may survive inside the subject value — harmlessly. What must not
  // happen is a line of its own beginning with it.
  assert.ok(!/^Reply-To:/im.test(msg), 'Reply-To was injected as its own header')
  assert.equal(msg.split(CRLF).filter((l) => l.startsWith('Subject: ')).length, 1)
})

test('sanitizeHeader collapses every line break, not just the first', () => {
  assert.equal(sanitizeHeader('a' + CRLF + 'b\nc\rd'), 'a b c d')
  assert.equal(sanitizeHeader('  padded  '), 'padded')
})

/* --------------------------------------------------------------- encoding --- */

test('a non-ASCII subject is RFC 2047 encoded rather than sent raw', () => {
  const encoded = encodeHeaderValue('Diwali edit — ₹25,000')
  assert.match(encoded, /^=\?UTF-8\?B\?/)
  assert.equal(Buffer.from(encoded.slice(10, -2), 'base64').toString('utf8'), 'Diwali edit — ₹25,000')
})

test('a plain ASCII subject is left alone', () => {
  assert.equal(encodeHeaderValue('One Lipstick, Three Outfits'), 'One Lipstick, Three Outfits')
})

test('the body survives curly quotes, em dashes and rupees intact', () => {
  const body = 'Hi Priya,\n\n“One Lipstick, Three Outfits” — I’d love to explore this at ₹25,000.'
  assert.equal(bodyOf(buildRawMessage({ to: 'p@a.com', subject: 'x', body })), body)
})

test('long bodies are wrapped, and every line stays well inside the limit', () => {
  const msg = buildRawMessage({ to: 'p@a.com', subject: 'x', body: 'word '.repeat(800) })
  for (const line of msg.split(CRLF)) assert.ok(line.length <= 998, 'line of ' + line.length)
})

test('the Gmail payload is unpadded base64url and decodes to the message', () => {
  const draft = { to: 'priya@aurelia.com', subject: 'Idea', body: 'Hello there' }
  const raw = encodeForGmail(draft)
  assert.ok(!/[+/=]/.test(raw), 'must be url-safe and unpadded')
  assert.equal(decode(raw), buildRawMessage(draft))
})

/* -------------------------------------------------------------- recipient --- */

test('a display name is quoted, and an existing quote cannot break out of it', () => {
  assert.equal(formatRecipient('p@a.com', 'Priya Sharma'), '"Priya Sharma" <p@a.com>')
  assert.equal(formatRecipient('p@a.com', 'Priya "PS" Sharma'), '"Priya PS Sharma" <p@a.com>')
})

test('no display name means a bare address', () => {
  assert.equal(formatRecipient('p@a.com'), 'p@a.com')
  assert.equal(formatRecipient('p@a.com', '   '), 'p@a.com')
})

test('addresses that would bounce, or carry a newline, are refused', () => {
  const bad = ['', 'priya', 'priya@', '@aurelia.com', 'a b@c.com', 'p@a.com\nBcc: x@y.com', 'p@@a.com', 'p@a']
  for (const value of bad) assert.equal(isSendableAddress(value), false, JSON.stringify(value) + ' should be refused')
  for (const value of ['priya@aurelia.com', 'p.sharma+brand@aurelia.co.in']) {
    assert.equal(isSendableAddress(value), true, value + ' should be allowed')
  }
})

test('building refuses outright rather than sending somewhere unintended', () => {
  assert.throws(() => buildRawMessage({ to: 'not-an-address', subject: 'x', body: 'y' }))
})

/* ---------------------------------------------------------------- subject --- */

test('the subject leads with the idea, not the word collaboration', () => {
  assert.equal(
    proposalSubject('One Lipstick, Three Outfits', 'Aurelia Beauty'),
    'One Lipstick, Three Outfits — a collaboration idea for Aurelia Beauty',
  )
})

test('the subject degrades sensibly when the idea or brand is missing', () => {
  assert.equal(proposalSubject('', 'Aurelia Beauty'), 'A collaboration idea for Aurelia Beauty')
  assert.equal(proposalSubject('Trail series', ''), 'Trail series')
  assert.equal(proposalSubject('', ''), 'A collaboration idea')
})
