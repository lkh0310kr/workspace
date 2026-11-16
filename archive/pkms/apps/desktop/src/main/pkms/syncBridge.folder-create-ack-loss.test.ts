import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-folder-create-ack-loss-${process.pid}`,
  request: vi.fn(),
  folder: null as null | { id: string; path: string; kind: string; revision: number },
  createRequests: [] as Array<{ operationId: string; path: string }>
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS folder create retry after lost acknowledgement', () => {
  const workspaceId = 'folder-create-ack-loss-test'
  const folderPath = 'docs'
  let root: string
  let currentRevision = 0
  let changeRequests = 0
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-folder-create-ack-loss-root-'))
    await mkdir(path.join(root, folderPath))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        remoteFiles: { [workspaceId]: {} },
        syncCursors: { [workspaceId]: 0 },
        remoteTrees: { [workspaceId]: [] },
        localDirectories: { [workspaceId]: {} }
      })
    )
    testRuntime.request.mockImplementation(
      async (url: string, options: { method: string; body?: { kind: string; value?: string } }) => {
        if (url.includes('/sync/changes')) {
          changeRequests++
          return {
            status: 200,
            body: {
              changes:
                currentRevision && testRuntime.folder
                  ? [{ ...testRuntime.folder, deleted: false }]
                  : [],
              hasMore: false,
              nextRevision: currentRevision,
              lastRevision: currentRevision,
              lastFileId: ''
            }
          }
        }
        if (url.endsWith('/operations') && options.method === 'POST') {
          const payload = JSON.parse(options.body?.value ?? '{}') as {
            operationId: string
            operation: { type?: string; path?: string }
          }
          if (payload.operation.type !== 'create-folder')
            return { status: 500, body: { error: 'unexpected_operation' } }
          testRuntime.createRequests.push({
            operationId: payload.operationId,
            path: payload.operation.path ?? ''
          })
          testRuntime.folder = {
            id: 'folder-docs',
            path: payload.operation.path ?? '',
            kind: 'folder',
            revision: 1
          }
          currentRevision = 1
          // Server commits folder creation, then the response is lost.
          throw new TypeError('fetch failed')
        }
        return { status: 500, body: { error: 'unexpected_mock_request', url } }
      }
    )
  })

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it('clears the durable create intent when the change feed confirms the folder exists', async () => {
    const first = await scanPkmsSyncBridge(workspaceId)
    expect(first.state).toBe('offline')
    expect(testRuntime.createRequests).toHaveLength(1)

    const afterLostAck = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingFolderCreates: Record<string, Record<string, string>>
    }
    expect(afterLostAck.pendingFolderCreates[workspaceId][folderPath]).toBe(
      testRuntime.createRequests[0].operationId
    )

    const recovered = await scanPkmsSyncBridge(workspaceId)
    expect(recovered.state).toBe('synced')
    expect(changeRequests).toBeGreaterThanOrEqual(2)
    expect(testRuntime.createRequests).toHaveLength(1)

    const finalState = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingFolderCreates: Record<string, Record<string, string>>
      remoteTrees: Record<string, Array<{ id: string; path: string; kind: string }>>
    }
    expect(finalState.pendingFolderCreates[workspaceId][folderPath]).toBeUndefined()
    expect(testRuntime.folder).not.toBeNull()
    expect(finalState.remoteTrees[workspaceId][0]).toMatchObject(testRuntime.folder!)
  })
})
