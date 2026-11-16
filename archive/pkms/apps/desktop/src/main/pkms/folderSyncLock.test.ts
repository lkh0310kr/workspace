import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireFolderSyncLock, releaseFolderSyncLock, type FolderSyncLock } from './folderSyncLock'

describe('folder sync lock', () => {
  let root: string | undefined
  let locks: FolderSyncLock[] = []

  afterEach(async () => {
    await Promise.all(locks.map((lock) => releaseFolderSyncLock(lock)))
    locks = []
    if (root) await rm(root, { recursive: true, force: true })
    root = undefined
  })

  it('rejects a second owner and releases only the matching lock token', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'workspace-pkms-sync-lock-test-'))
    const first = await acquireFolderSyncLock(root, 'workspace-a')
    locks.push(first)

    await expect(acquireFolderSyncLock(root, 'workspace-b')).rejects.toThrow(
      'editing_folder_in_use'
    )

    await releaseFolderSyncLock(first)
    const second = await acquireFolderSyncLock(root, 'workspace-b')
    locks.push(second)
    await releaseFolderSyncLock(first)

    await expect(acquireFolderSyncLock(root, 'workspace-c')).rejects.toThrow(
      'editing_folder_in_use'
    )

    await releaseFolderSyncLock(second)
    const third = await acquireFolderSyncLock(root, 'workspace-c')
    locks.push(third)
  })
})
