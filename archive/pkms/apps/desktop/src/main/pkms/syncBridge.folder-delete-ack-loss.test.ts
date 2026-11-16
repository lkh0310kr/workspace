import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-folder-delete-ack-loss-${process.pid}`,
  request: vi.fn(),
  acceptedDelete: false,
  deleteOperations: [] as Array<{ fileId: string; path: string; operationId: string }>
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS folder delete retry after lost acknowledgement', () => {
  const workspaceId = 'folder-delete-ack-loss-test'
  const folderId = 'deleted-folder'
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-folder-delete-ack-loss-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    const folder = { id: folderId, path: 'docs', kind: 'folder', revision: 1 }
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        remoteFiles: { [workspaceId]: {} },
        syncCursors: { [workspaceId]: 1 },
        remoteTrees: { [workspaceId]: [folder] },
        localDirectories: { [workspaceId]: { docs: 'device:folder-inode' } }
      })
    )
    testRuntime.request.mockImplementation(
      async (
        url: string,
        options: { method: string; body?: { kind: string; value?: string } }
      ) => {
        if (url.includes('/sync/changes'))
          return {
            status: 200,
            body: {
              changes: testRuntime.acceptedDelete
                ? [{ ...folder, revision: 2, deleted: true }]
                : [],
              hasMore: false,
              nextRevision: testRuntime.acceptedDelete ? 2 : 1,
              lastRevision: testRuntime.acceptedDelete ? 2 : 1,
              lastFileId: folderId
            }
          }
        if (url.includes('/sync/tree'))
          return {
            status: 200,
            body: {
              revision: testRuntime.acceptedDelete ? 2 : 1,
              files: testRuntime.acceptedDelete ? [] : [folder],
              hasMore: false,
              nextPath: ''
            }
          }
        if (url.endsWith('/operations') && options.method === 'POST') {
          const payload = JSON.parse(options.body?.value ?? '{}') as {
            operationId: string
            operation: { type: string; fileId: string }
          }
          if (payload.operation.type !== 'delete')
            return { status: 500, body: { error: 'unexpected_operation' } }
          testRuntime.deleteOperations.push({
            fileId: payload.operation.fileId,
            path: 'docs',
            operationId: payload.operationId
          })
          testRuntime.acceptedDelete = true
          // Server commit succeeds, but its response is lost.
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

  it('reconciles the committed delete from the change feed without issuing a duplicate', async () => {
    const firstAttempt = await scanPkmsSyncBridge(workspaceId)
    expect(firstAttempt.state).toBe('offline')
    expect(testRuntime.deleteOperations).toHaveLength(1)

    const afterLostAck = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingDeletes: Record<string, Record<string, { operationId: string; fileId: string }>>
    }
    expect(afterLostAck.pendingDeletes[workspaceId].docs).toMatchObject({
      operationId: testRuntime.deleteOperations[0].operationId,
      fileId: folderId
    })

    const recovered = await scanPkmsSyncBridge(workspaceId)
    expect(recovered.state).toBe('synced')
    expect(testRuntime.deleteOperations).toHaveLength(1)

    const finalState = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingDeletes: Record<string, Record<string, unknown>>
      remoteTrees: Record<string, Array<{ id: string; path: string }>>
      syncCursors: Record<string, number>
    }
    expect(finalState.pendingDeletes[workspaceId].docs).toBeUndefined()
    expect(finalState.remoteTrees[workspaceId]).toEqual([])
    expect(finalState.syncCursors[workspaceId]).toBe(2)
  })
})
