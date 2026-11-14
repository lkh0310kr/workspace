import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-ack-loss-test-${process.pid}`,
  request: vi.fn(),
  acceptedFile: null as null | { id: string; path: string; kind: string; revision: number },
  createRequests: [] as Array<Record<string, unknown>>
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS create retry after lost acknowledgement', () => {
  const workspaceId = 'ack-loss-test'
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const content = '# Created once\n'

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-ack-loss-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'note.md'), content)
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        pendingPaths: { [workspaceId]: ['note.md'] }
      })
    )
    testRuntime.request.mockImplementation(
      async (url: string, options: { method: string; body?: { kind: string; value?: string } }) => {
        if (url.includes('/sync/tree'))
          return {
            status: 200,
            body: {
              revision: testRuntime.acceptedFile ? 1 : 0,
              files: testRuntime.acceptedFile ? [testRuntime.acceptedFile] : [],
              hasMore: false,
              nextPath: ''
            }
          }
        if (url.includes('/sync/download'))
          return {
            status: 200,
            body: {
              documents: testRuntime.acceptedFile
                ? [
                    {
                      ...testRuntime.acceptedFile,
                      text: content
                    }
                  ]
                : []
            }
          }
        if (url.includes('/sync/changes'))
          return {
            status: 200,
            body: {
              changes: testRuntime.acceptedFile
                ? [{ ...testRuntime.acceptedFile, deleted: false }]
                : [],
              hasMore: false,
              nextRevision: 1,
              lastRevision: 1,
              lastFileId: testRuntime.acceptedFile?.id ?? ''
            }
          }
        if (url.endsWith('/operations') && options.method === 'POST') {
          const payload = JSON.parse(options.body?.value ?? '{}') as {
            operationId: string
            operation: { type: string; fileId: string; path: string; content: string }
          }
          testRuntime.createRequests.push(payload)
          if (!testRuntime.acceptedFile) {
            testRuntime.acceptedFile = {
              id: payload.operation.fileId,
              path: payload.operation.path,
              kind: 'markdown',
              revision: 1
            }
            // Simulate the server committing the create while its response is lost.
            throw new TypeError('fetch failed')
          }
          return {
            status: 200,
            body: { file: testRuntime.acceptedFile, acceptedRevision: 1, duplicate: true }
          }
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

  it('reconciles the accepted cloud file after the create response is lost without creating another', async () => {
    const firstAttempt = await scanPkmsSyncBridge(workspaceId)
    expect(firstAttempt.state).toBe('offline')
    expect(testRuntime.createRequests).toHaveLength(1)

    const afterLostAck = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingCreates: Record<string, Record<string, { operationId: string; fileId: string }>>
    }
    const pending = afterLostAck.pendingCreates[workspaceId]['note.md']
    expect(pending).toMatchObject({
      operationId: testRuntime.createRequests[0].operationId,
      fileId: testRuntime.acceptedFile?.id
    })

    const retry = await scanPkmsSyncBridge(workspaceId)
    expect(retry.state).toBe('synced')
    expect(testRuntime.createRequests).toHaveLength(1)
    expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe(content)

    const finalState = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingCreates: Record<string, Record<string, unknown>>
      baselines: Record<string, Record<string, { fileId: string; hash: string }>>
    }
    expect(finalState.pendingCreates[workspaceId]['note.md']).toBeUndefined()
    expect(finalState.baselines[workspaceId]['note.md']).toMatchObject({
      fileId: testRuntime.acceptedFile?.id
    })
  })
})
