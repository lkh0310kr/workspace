import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-excluded-delete-${process.pid}`,
  request: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS exclusions protect pending delete intents', () => {
  const workspaceId = 'excluded-pending-delete-test'
  const folder = { id: 'private-folder', path: 'private', kind: 'folder', revision: 10 }
  const child = { id: 'private-note', path: 'private/note.md', kind: 'markdown', revision: 10 }
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-excluded-delete-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: ['private/**'] } },
        baselines: {
          [workspaceId]: {
            [child.path]: { fileId: child.id, hash: 'baseline-hash', revision: 10 }
          }
        },
        remoteFiles: { [workspaceId]: { [child.id]: child } },
        syncCursors: { [workspaceId]: 10 },
        remoteTrees: { [workspaceId]: [folder, child] },
        localDirectories: { [workspaceId]: { private: 'dev:private' } },
        pendingDeletes: {
          [workspaceId]: {
            private: {
              kind: 'folder',
              path: 'private',
              fileId: folder.id,
              operationId: 'delete-private',
              baseRevision: 10,
              firstObservedAt: 1,
              attempts: 1
            }
          }
        }
      })
    )
    testRuntime.request.mockImplementation(async (url: string, options: { method: string }) => {
      if (url.includes('/sync/changes'))
        return {
          status: 200,
          body: { changes: [], hasMore: false, nextRevision: 10, lastRevision: 10, lastFileId: '' }
        }
      return { status: 500, body: { error: `unexpected_request:${options.method}:${url}` } }
    })
  })

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it('cancels an excluded pending delete and keeps the remote subtree', async () => {
    const status = await scanPkmsSyncBridge(workspaceId)
    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingDeletes: Record<string, Record<string, unknown>>
      remoteTrees: Record<string, Array<{ id: string; path: string }>>
      baselines: Record<string, Record<string, { fileId: string; revision: number }>>
    }
    expect(status.state).toBe('synced')
    expect(
      testRuntime.request.mock.calls.some(
        ([url, options]) => url.endsWith('/operations') && options.method === 'POST'
      )
    ).toBe(false)
    expect(persisted.pendingDeletes[workspaceId]?.private).toBeUndefined()
    expect(persisted.remoteTrees[workspaceId]).toEqual([folder, child])
    expect(persisted.baselines[workspaceId][child.path]).toEqual({
      fileId: child.id,
      hash: 'baseline-hash',
      revision: 10
    })
    expect(status.itemStates.private).toBe('excluded')
  })
})
