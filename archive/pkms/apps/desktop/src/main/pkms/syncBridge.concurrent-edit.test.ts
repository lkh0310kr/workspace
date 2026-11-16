import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-concurrent-edit-${process.pid}`,
  request: vi.fn(),
  createOperations: [] as Array<{ path: string; content: string; fileId: string }>,
  acceptedConflict: null as null | { id: string; path: string; kind: string; revision: number },
  documentDownloads: 0
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS concurrent Markdown edits', () => {
  const workspaceId = 'concurrent-edit-test'
  const fileId = 'shared-note'
  const baseText = '# Base revision\n'
  const localText = '# Local divergent edit\n'
  const remoteText = '# Remote divergent edit\n'
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const hash = (content: string) => createHash('sha256').update(content).digest('hex')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-concurrent-edit-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'note.md'), localText)
    const baselineFile = {
      id: fileId,
      path: 'note.md',
      kind: 'markdown',
      revision: 1
    }
    const latestRemoteFile = { ...baselineFile, revision: 2 }
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        baselines: {
          [workspaceId]: { 'note.md': { fileId, hash: hash(baseText), revision: 1 } }
        },
        remoteFiles: { [workspaceId]: { [fileId]: baselineFile } },
        syncCursors: { [workspaceId]: 1 },
        remoteTrees: { [workspaceId]: [baselineFile] },
        localDirectories: { [workspaceId]: {} },
        pendingPaths: { [workspaceId]: ['note.md'] }
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
              changes: [
                { ...latestRemoteFile, deleted: false },
                ...(testRuntime.acceptedConflict
                  ? [{ ...testRuntime.acceptedConflict, deleted: false }]
                  : [])
              ],
              hasMore: false,
              nextRevision: testRuntime.acceptedConflict ? 3 : 2,
              lastRevision: testRuntime.acceptedConflict ? 3 : 2,
              lastFileId: testRuntime.acceptedConflict?.id ?? fileId
            }
          }
        if (url.includes('/sync/tree'))
          return {
            status: 200,
            body: {
              revision: testRuntime.acceptedConflict ? 3 : 2,
              files: [latestRemoteFile, ...(testRuntime.acceptedConflict ? [testRuntime.acceptedConflict] : [])],
              hasMore: false,
              nextPath: ''
            }
          }
        if (url.includes('/sync/download') && options.method === 'POST') {
          testRuntime.documentDownloads++
          return {
            status: 200,
            body: {
              documents: [
                { id: fileId, path: 'note.md', revision: 2, text: remoteText },
                ...(testRuntime.acceptedConflict
                  ? [
                      {
                        ...testRuntime.acceptedConflict,
                        text: localText
                      }
                    ]
                  : [])
              ]
            }
          }
        }
        if (url.endsWith('/operations') && options.method === 'POST') {
          const payload = JSON.parse(options.body?.value ?? '{}') as {
            operation: { type: string; path: string; fileId: string; content: string }
          }
          if (payload.operation.type !== 'create-file')
            return { status: 500, body: { error: 'unexpected_overwrite_operation' } }
          testRuntime.createOperations.push({
            path: payload.operation.path,
            content: payload.operation.content,
            fileId: payload.operation.fileId
          })
          testRuntime.acceptedConflict = {
            id: payload.operation.fileId,
            path: payload.operation.path,
            kind: 'markdown',
            revision: 3
          }
          // The server committed the conflict copy, but the response was lost.
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

  it('preserves both divergent edits and keeps the latest remote revision at the original path', async () => {
    const firstAttempt = await scanPkmsSyncBridge(workspaceId)
    expect(firstAttempt.state).toBe('offline')
    expect(testRuntime.createOperations).toHaveLength(1)
    expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe(localText)

    const afterLostAck = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingCreates: Record<string, Record<string, { fileId: string; operationId: string }>>
    }
    const conflictPath = testRuntime.acceptedConflict!.path
    expect(afterLostAck.pendingCreates[workspaceId][conflictPath]).toMatchObject({
      fileId: testRuntime.createOperations[0].fileId,
      operationId: expect.any(String)
    })

    const result = await scanPkmsSyncBridge(workspaceId)

    expect(result.state).toBe('synced')
    expect(testRuntime.documentDownloads).toBeGreaterThanOrEqual(2)
    expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe(remoteText)

    expect(await readdir(root)).toContain(path.basename(conflictPath))
    expect(await readFile(path.join(root, conflictPath), 'utf8')).toBe(localText)
    expect(testRuntime.createOperations).toHaveLength(1)
    expect(testRuntime.createOperations[0]).toMatchObject({
      path: conflictPath,
      content: localText
    })
    expect(testRuntime.createOperations[0].fileId).not.toBe(fileId)

    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      baselines: Record<string, Record<string, { fileId: string; hash: string; revision: number }>>
    }
    expect(persisted.baselines[workspaceId]['note.md']).toMatchObject({
      fileId,
      hash: hash(remoteText),
      revision: 2
    })
    expect(persisted.baselines[workspaceId][conflictPath]).toMatchObject({
      hash: hash(localText),
      revision: 3
    })
    const finalState = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingCreates: Record<string, Record<string, unknown>>
    }
    expect(finalState.pendingCreates[workspaceId][conflictPath]).toBeUndefined()
  })
})
