/**
 * Whole-workspace export and restore.
 *
 * Everything lives in one localStorage key with no versioning, so until now a
 * single corruption or a cleared store meant every project was gone with no
 * recovery. Images are included as base64 in the backup file (they're in
 * IndexedDB at rest, but a backup is worthless if it doesn't carry them).
 */

import { getFile, putFile } from './fileStore'
import type { Episode, Pattern, PlaybookRule, Project, ProjectAsset } from './types'

const BACKUP_VERSION = 1

export interface WorkspaceBackup {
  version: number
  exportedAt: string
  projects: Project[]
  episodes: Episode[]
  assets: ProjectAsset[]
  patterns: Pattern[]
  playbook: PlaybookRule[]
  /** fileId → base64 data URL, for both scene images and uploaded music. */
  files: Record<string, string>
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read a stored file.'))
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

export async function buildBackup(data: {
  projects: Project[]
  episodes: Episode[]
  assets: ProjectAsset[]
  patterns: Pattern[]
  playbook: PlaybookRule[]
}): Promise<WorkspaceBackup> {
  const fileIds = new Set<string>()
  data.episodes.forEach((ep) =>
    ep.scenes.forEach((s) => {
      if (s.imageFileId) fileIds.add(s.imageFileId)
      if (s.audio.musicFileId) fileIds.add(s.audio.musicFileId)
    }),
  )

  const files: Record<string, string> = {}
  for (const id of fileIds) {
    const blob = await getFile(id)
    if (blob) files[id] = await blobToDataUrl(blob)
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ...data,
    files,
  }
}

export function downloadBackup(backup: WorkspaceBackup) {
  const stamp = backup.exportedAt.slice(0, 10)
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `director-os-backup-${stamp}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Validates a backup file and writes its media back into IndexedDB.
 * Returns the records for the caller to load into the store. */
export async function restoreBackup(text: string): Promise<Omit<WorkspaceBackup, 'files'>> {
  let parsed: WorkspaceBackup
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray(parsed.projects) ||
    !Array.isArray(parsed.episodes)
  ) {
    throw new Error("That doesn't look like a Director OS backup.")
  }
  if (parsed.version > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of Director OS.')
  }

  for (const [id, dataUrl] of Object.entries(parsed.files ?? {})) {
    try {
      await putFile(id, await dataUrlToBlob(dataUrl))
    } catch {
      // A single unreadable asset shouldn't abort restoring the whole workspace.
      console.error('Could not restore file', id)
    }
  }

  return {
    version: parsed.version,
    exportedAt: parsed.exportedAt,
    projects: parsed.projects,
    episodes: parsed.episodes,
    assets: parsed.assets ?? [],
    patterns: parsed.patterns ?? [],
    playbook: parsed.playbook ?? [],
  }
}
