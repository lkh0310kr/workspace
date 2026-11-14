import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-incomplete-scan-${process.pid}`,
  inaccessibleDirectory: '',
  request: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: async (directory: string, options?: object) => {
        if (path.resolve(directory) === testRuntime.inaccessibleDirectory)
          throw Object.assign(new Error('permission denied during scan'), { code: 'EACCES' })
        return actual.promises.readdir(directory, options as never)
      }
    }
  }
})
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS incomplete local inventory safety', () => {
  const workspaceId = 'incomplete-local-inventory-test'
  const cursor = 27
  const directories = { docs: 'dev:folder', 'docs/chapter': 'dev:chapter' }
  const note = { id: 'remote-note', path: 'docs/chapter/note.md', kind: 'markdown', revision: 27 }
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-incomplete-inventory-root-'))
    await mkdir(path.join(root, 'docs', 'chapter'), { recursive: true })
    await writeFile(path.join(root, 'docs', 'chapter', 'note.md'), 'local copy')
    testRuntime.inaccessibleDirectory = path.resolve(root, 'docs/chapter')
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        baselines: {
          [workspaceId]: {
            [note.path]: { fileId: note.id, hash: 'baseline-hash', revision: cursor }
          }
        },
        remoteFiles: { [workspaceId]: { [note.id]: note } },
        syncCursors: { [workspaceId]: cursor },
        remoteTrees: {
          [workspaceId]: [
            { id: 'docs-folder', path: 'docs', kind: 'folder', revision: cursor },
            { id: 'chapter-folder', path: 'docs/chapter', kind: 'folder', revision: cursor },
            note
          ]
        },
        localDirectories: { [workspaceId]: directories },
        pendingPaths: { [workspaceId]: [note.path] }
      })
    )
  })

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it('keeps cursor, baseline and directory identities when a nested read fails', async () => {
    const status = await scanPkmsSyncBridge(workspaceId)
    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      syncCursors: Record<string, number>
      localDirectories: Record<string, Record<string, string>>
      pendingPaths: Record<string, string[]>
      baselines: Record<string, Record<string, { fileId: string; hash: string; revision: number }>>
      pendingDeletes: Record<string, Record<string, unknown>>
      remoteTrees: Record<string, unknown[]>
    }

    expect(status.state).toBe('error')
    expect(status.pendingFiles).toBeGreaterThan(0)
    expect(status.error).toContain('permission denied during scan')
    expect(testRuntime.request).not.toHaveBeenCalled()
    expect(persisted.syncCursors[workspaceId]).toBe(cursor)
    expect(persisted.localDirectories[workspaceId]).toEqual(directories)
    expect(persisted.pendingPaths[workspaceId]).toContain(note.path)
    expect(persisted.baselines[workspaceId][note.path]).toEqual({
      fileId: note.id,
      hash: 'baseline-hash',
      revision: cursor
    })
    expect(persisted.pendingDeletes[workspaceId]).toBeUndefined()
    expect(persisted.remoteTrees[workspaceId]).toHaveLength(3)
    expect(await readFile(path.join(root, note.path), 'utf8')).toBe('local copy')
  })
})
