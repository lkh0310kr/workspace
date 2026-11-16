import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-root-switch-test-${process.pid}`,
  request: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { configurePkmsSyncBridge, scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS root switch reconciliation', () => {
  const workspaceId = 'root-switch-test'
  let oldRoot: string
  let newRoot: string
  const apiCalls: Array<{ url: string; method: string; payload?: Record<string, unknown> }> = []
  const cloudFile = {
    id: 'cloud-file',
    path: 'cloud-only/note.md',
    kind: 'markdown',
    revision: 7
  }
  const cloudFolder = { id: 'cloud-folder', path: 'cloud-only', kind: 'folder', revision: 7 }

  beforeAll(async () => {
    oldRoot = await mkdtemp(path.join(os.tmpdir(), 'pkms-old-root-'))
    newRoot = await mkdtemp(path.join(os.tmpdir(), 'pkms-new-root-'))
    await writeFile(path.join(oldRoot, 'old.md'), 'previous root content')
    await writeFile(path.join(newRoot, 'local-only.md'), 'new root content')
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(
      path.join(testRuntime.userData, 'pkms-sync-bridge.json'),
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: oldRoot, excludedPaths: [] } },
        baselines: {
          [workspaceId]: { 'old.md': { fileId: 'old-cloud-file', hash: 'old', revision: 3 } }
        },
        remoteFiles: {
          [workspaceId]: {
            'old-cloud-file': {
              id: 'old-cloud-file',
              path: 'old.md',
              kind: 'markdown',
              revision: 3
            }
          }
        },
        syncCursors: { [workspaceId]: 3 },
        remoteTrees: {
          [workspaceId]: [{ id: 'old-cloud-file', path: 'old.md', kind: 'markdown', revision: 3 }]
        },
        remoteTreeVersions: { [workspaceId]: 3 },
        localDirectories: { [workspaceId]: {} },
        pendingDeletes: { [workspaceId]: {} },
        pendingCreates: {
          [workspaceId]: {
            'previous-pending.md': {
              operationId: 'previous-pending-operation',
              fileId: 'previous-pending-id',
              contentHash: 'pending-hash',
              content: 'previous pending content'
            }
          }
        }
      })
    )
    testRuntime.request.mockImplementation(
      async (url: string, options: { method: string; body?: { kind: string; value?: string } }) => {
        const payload =
          options.body?.kind === 'json' ? JSON.parse(options.body.value ?? '{}') : undefined
        apiCalls.push({ url, method: options.method, payload })
        if (url.includes('/api/realtime/config') || url.includes('/api/realtime/token'))
          return { status: 503, body: { error: 'offline' } }
        if (url.includes('/sync/tree'))
          return {
            status: 200,
            body: {
              revision: 7,
              files: [cloudFolder, cloudFile],
              hasMore: false,
              nextPath: ''
            }
          }
        if (url.includes('/sync/download'))
          return {
            status: 200,
            body: {
              documents: [
                { id: cloudFile.id, path: cloudFile.path, revision: 7, text: 'cloud-only content' }
              ]
            }
          }
        if (url.endsWith('/operations') && options.method === 'POST') {
          const operation = payload?.operation as { type?: string; path?: string; fileId?: string }
          if (operation?.type === 'delete')
            return { status: 500, body: { error: 'unexpected_cloud_delete' } }
          if (operation?.type === 'create-file')
            return {
              status: 200,
              body: {
                acceptedRevision: 8,
                file: {
                  id: operation.fileId,
                  path: operation.path,
                  kind: 'markdown',
                  revision: 8
                }
              }
            }
        }
        return { status: 500, body: { error: 'unexpected_mock_request', url } }
      }
    )
  })

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(oldRoot, { recursive: true, force: true })
    await rm(newRoot, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it('seeds the new root without deleting cloud content and preserves cloud/local-only files', async () => {
    const configured = await configurePkmsSyncBridge(workspaceId, newRoot)
    expect(configured.folderPath).toBe(await realpath(newRoot))
    await stopPkmsSyncBridges()

    const afterRootReset = JSON.parse(
      await readFile(path.join(testRuntime.userData, 'pkms-sync-bridge.json'), 'utf8')
    )
    expect(afterRootReset.baselines[workspaceId]).toEqual({})
    expect(afterRootReset.syncCursors[workspaceId]).toBeUndefined()
    expect(afterRootReset.pendingCreates[workspaceId]['previous-pending.md'].operationId).toBe(
      'previous-pending-operation'
    )

    await scanPkmsSyncBridge(workspaceId)

    expect(await readFile(path.join(newRoot, cloudFile.path), 'utf8')).toBe('cloud-only content')
    expect(await readFile(path.join(newRoot, 'local-only.md'), 'utf8')).toBe('new root content')
    const deleteOperations = apiCalls.filter(
      (call) =>
        call.url.endsWith('/operations') &&
        call.payload?.operation &&
        (call.payload.operation as { type?: string }).type === 'delete'
    )
    const createOperations = apiCalls.filter(
      (call) =>
        call.url.endsWith('/operations') &&
        call.payload?.operation &&
        (call.payload.operation as { type?: string }).type === 'create-file'
    )
    expect(deleteOperations).toHaveLength(0)
    expect(createOperations).toHaveLength(1)
    const finalState = JSON.parse(
      await readFile(path.join(testRuntime.userData, 'pkms-sync-bridge.json'), 'utf8')
    )
    expect(finalState.baselines[workspaceId]['cloud-only/note.md'].fileId).toBe(cloudFile.id)
    expect(finalState.baselines[workspaceId]['local-only.md'].fileId).toBeTruthy()
  })
})
