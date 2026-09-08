import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * Tauri refuses any host missing from the HTTP capability allowlist, and the
 * refusal surfaces as a vague failure at the moment a user tries to do the
 * thing. Adding an endpoint without adding its host therefore ships silently.
 * Gmail sending shipped exactly that way once; this is here so it cannot again.
 *
 * Only what is handed to `fetch` counts. A permalink stored on a record, a
 * Google Fonts stylesheet injected into an iframe, and the consent URL opened
 * in the system browser all name https hosts that the plugin never sees, and
 * flagging those would train everyone to ignore this test.
 */

const capability = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8'))
const http = capability.permissions.find((p) => p && p.identifier === 'http:default')
const allowed = http.allow.map((entry) => new URL(entry.url.replace(/\*$/, '')).host)

/** `const NAME = 'https://…'` or a template built from an earlier constant. */
function constants(source) {
  const found = new Map()
  for (const [, name, value] of source.matchAll(/const\s+(\w+)\s*=\s*[`'"]([^`'"]*https:\/\/[^`'"]*)[`'"]/g)) {
    found.set(name, value)
  }
  for (const [, name, value] of source.matchAll(/const\s+(\w+)\s*=\s*`\$\{(\w+)\}/g)) {
    if (found.has(value)) found.set(name, found.get(value))
  }
  return found
}

function hostOf(value) {
  const match = /https:\/\/([a-z0-9.-]+)/i.exec(value)
  return match ? match[1] : null
}

/** Hosts reached through the plugin, per file. */
function fetchedHosts(source) {
  const declared = constants(source)
  const hosts = new Set()
  for (const [, argument] of source.matchAll(/\bfetch\(\s*([^,)]+)/g)) {
    const inline = hostOf(argument)
    if (inline) { hosts.add(inline); continue }
    // `fetch(SEND_ENDPOINT` or `fetch(url.toString()` — resolve the identifier,
    // and for a built URL fall back to the one endpoint constant in the file.
    const identifier = /^(\w+)/.exec(argument.trim())?.[1]
    const value = identifier && declared.get(identifier)
    const resolved = value ? hostOf(value) : null
    if (resolved) hosts.add(resolved)
    else for (const candidate of declared.values()) {
      const host = hostOf(candidate)
      if (host) hosts.add(host)
    }
  }
  return hosts
}

const networkFiles = readdirSync('src/lib')
  .filter((f) => f.endsWith('.ts'))
  .map((f) => [f, readFileSync(`src/lib/${f}`, 'utf8')])
  .filter(([, source]) => source.includes('@tauri-apps/plugin-http'))

test('every host fetched through the Tauri HTTP plugin is allowlisted', () => {
  const missing = new Set()
  for (const [file, source] of networkFiles) {
    for (const host of fetchedHosts(source)) {
      if (!allowed.includes(host)) missing.add(`${host} (src/lib/${file})`)
    }
  }
  assert.deepEqual([...missing], [], 'these hosts will be refused by Tauri at runtime')
})

test('the scan still finds endpoints, so it cannot pass by finding nothing', () => {
  const seen = new Set()
  for (const [, source] of networkFiles) for (const host of fetchedHosts(source)) seen.add(host)
  assert.ok(networkFiles.length >= 4, `only ${networkFiles.length} network modules found`)
  assert.ok(seen.size >= 4, `only found ${seen.size} fetched hosts: ${[...seen]}`)
  assert.ok(seen.has('gmail.googleapis.com'), 'the Gmail endpoint should be detected')
})

test('the allowlist stays pinned to https and to explicit hosts', () => {
  for (const entry of http.allow) {
    assert.match(entry.url, /^https:\/\//, `${entry.url} must be https`)
    assert.ok(!/^https:\/\/\*/.test(entry.url), `${entry.url} must not wildcard the host`)
  }
})
