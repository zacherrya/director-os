/** Persists uploaded file bytes (music tracks) in IndexedDB, keyed by a stable
 * id, and hands back blob: URLs for playback. Blob URLs themselves don't
 * survive a reload, but the underlying bytes in IndexedDB do — this is what
 * lets an uploaded track keep playing after the app relaunches. */

const DB_NAME = 'director-os-files'
const STORE_NAME = 'files'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function putFile(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function getFile(id: string): Promise<Blob | undefined> {
  const db = await openDb()
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result as Blob | undefined)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return blob
}

export async function listFileIds(): Promise<string[]> {
  const db = await openDb()
  const keys = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAllKeys()
    request.onsuccess = () => resolve(request.result as string[])
    request.onerror = () => reject(request.error)
  })
  db.close()
  return keys
}

export async function deleteFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    ids.forEach((id) => tx.objectStore(STORE_NAME).delete(id))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/** Deletes every stored file whose id isn't in `referencedIds` — run at
 * startup so files dropped from a scene (or a deleted scene) don't
 * accumulate forever. */
export async function pruneUnusedFiles(referencedIds: Set<string>): Promise<number> {
  const allIds = await listFileIds()
  const orphaned = allIds.filter((id) => !referencedIds.has(id))
  await deleteFiles(orphaned)
  return orphaned.length
}

const resolvedUrlCache = new Map<string, string>()

/** Resolves a stored file id to a playable blob: URL, reusing the same URL for
 * the lifetime of the session so repeated lookups don't leak object URLs. */
export async function resolveFileUrl(id: string): Promise<string | undefined> {
  const cached = resolvedUrlCache.get(id)
  if (cached) return cached
  const blob = await getFile(id)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  resolvedUrlCache.set(id, url)
  return url
}
