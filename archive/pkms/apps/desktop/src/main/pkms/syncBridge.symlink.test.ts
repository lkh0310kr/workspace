import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-symlink-test-${process.pid}`,
  request: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({
  requestPkmsApi: testRuntime.request,
  fetchPkmsAsset: vi.fn()
}))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS sync protects folders replaced by symlinks', () => {
  const workspaceId = 'symlink-protection-test'
  let root: string
  let target: string

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-sync-symlink-root-'))
    target = await mkdtemp(path.join(os.tmpdir(), 'pkms-sync-symlink-target-'))
    await writeFile(path.join(target, 'note.md'), 'remote baseline')
    await symlink(target, path.join(root, 'docs'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(
      path.join(testRuntime.userData, 'pkms-sync-bridge.json'),
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        baselines: {
          [workspaceId]: {
            'docs/note.md': { fileId: 'file-note', hash: 'baseline-hash', revision: 1 }
          }
        },
        remoteFiles: {
          [workspaceId]: {
            'file-note': { id: 'file-note', path: 'docs/note.md', kind: 'markdown', revision: 1 }
          }
        },
        syncCursors: { [workspaceId]: 1 },
        remoteTrees: {
          [workspaceId]: [
            { id: 'folder-docs', path: 'docs', kind: 'folder', revision: 1 },
            { id: 'file-note', path: 'docs/note.md', kind: 'markdown', revision: 1 }
          ]
        },
        localDirectories: { [workspaceId]: { docs: 'dev:old', 'docs/section': 'dev:child' } },
        pendingDeletes: {
          [workspaceId]: {
            docs: {
              kind: 'folder',
              path: 'docs',
              fileId: 'folder-docs',
              operationId: 'pending-delete-docs',
              baseRevision: 1,
              firstObservedAt: 1,
              attempts: 1
            }
          }
        }
      })
    )
    testRuntime.request.mockImplementation(async (url: string) => {
      if (url.includes('/sync/changes'))
        return {
          status: 200,
          body: { changes: [], hasMore: false, nextRevision: 1, lastRevision: 1, lastFileId: '' }
        }
      if (url.includes('/api/realtime/config') || url.includes('/api/realtime/token'))
        return { status: 503, body: { error: 'offline' } }
      return { status: 500, body: { error: 'unexpected_mock_request', url } }
    })
  })

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
    await rm(target, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it('cancels a pending folder delete and preserves the previous inventory identity', async () => {
    const status = await scanPkmsSyncBridge(workspaceId)
    const saved = JSON.parse(
      await readFile(path.join(testRuntime.userData, 'pkms-sync-bridge.json'), 'utf8')
    )
    const mutationRequests = testRuntime.request.mock.calls.filter(
      ([url, options]) => url.endsWith('/operations') && options.method === 'POST'
    )

    expect(mutationRequests).toHaveLength(0)
    expect(saved.pendingDeletes[workspaceId]?.docs).toBeUndefined()
    expect(saved.localDirectories[workspaceId]).toMatchObject({
      docs: 'dev:old',
      'docs/section': 'dev:child'
    })
    expect(saved.remoteTrees[workspaceId]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'folder-docs', path: 'docs' })])
    )
    expect(status.itemStates.docs).toBe('attention')
    expect(status.state).not.toBe('synced')
    expect(await readFile(path.join(target, 'note.md'), 'utf8')).toBe('remote baseline')
  })
})
