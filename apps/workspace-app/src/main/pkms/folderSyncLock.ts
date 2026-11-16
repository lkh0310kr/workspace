import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export type FolderSyncLock = { path: string; token: string }

function folderSyncLockPath(root: string): string {
  const key = createHash('sha256').update(path.resolve(root)).digest('hex')
  return path.join(tmpdir(), 'workspace-pkms-sync-locks', `${key}.lock`)
}

function processIsRunning(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export async function acquireFolderSyncLock(
  root: string,
  workspaceId: string
): Promise<FolderSyncLock> {
  const lockPath = folderSyncLockPath(root)
  await fs.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 })
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = randomUUID()
    try {
      const handle = await fs.open(lockPath, 'wx', 0o600)
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, workspaceId, token, startedAt: Date.now() })
        )
        await handle.sync()
      } catch (writeError) {
        await fs.unlink(lockPath).catch(() => {})
        throw writeError
      } finally {
        await handle.close()
      }
      return { path: lockPath, token }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      let owner: { pid?: number; token?: string } | null = null
      try {
        owner = JSON.parse(await fs.readFile(lockPath, 'utf8')) as { pid?: number; token?: string }
      } catch {
        /* A process may have exited while creating the lock. */
      }
      if (owner && processIsRunning(owner.pid ?? 0)) throw new Error('editing_folder_in_use')
      if (!owner) {
        try {
          const stat = await fs.stat(lockPath)
          if (Date.now() - stat.mtimeMs < 120_000) throw new Error('editing_folder_in_use')
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw statError
        }
      }
      try {
        await fs.unlink(lockPath)
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkError
      }
    }
  }
  throw new Error('editing_folder_in_use')
}

export async function releaseFolderSyncLock(lock: FolderSyncLock): Promise<void> {
  try {
    const owner = JSON.parse(await fs.readFile(lock.path, 'utf8')) as { token?: string }
    if (owner.token === lock.token) await fs.unlink(lock.path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
