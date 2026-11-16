import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as Y from 'yjs'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-file-delete-conflict-${process.pid}`,
  request: vi.fn(),
  deleteOperations: [] as Array<Record<string, unknown>>
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS file delete conflict recovery', () => {
  const workspaceId = 'file-delete-conflict-test'
  const oldText = '# Previous\n'
  const latestText = '# Updated remotely\n'
  const file = { id: 'remote-note', path: 'docs/note.md', kind: 'markdown', revision: 4 }
  let latestUpdate: string
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const textHash = (text: string) => createHash('sha256').update(text).digest('hex')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-file-delete-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    const remoteDoc = new Y.Doc({ guid: file.id })
    remoteDoc.getText('markdown').insert(0, latestText)
    latestUpdate = Buffer.from(Y.encodeStateAsUpdate(remoteDoc)).toString('base64')
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        baselines: {
          [workspaceId]: {
            'docs/note.md': { fileId: file.id, hash: textHash(oldText), revision: 4 }
          }
        },
        remoteFiles: { [workspaceId]: { [file.id]: file } },
        syncCursors: { [workspaceId]: 5 },
        remoteTrees: { [workspaceId]: [file] },
        localDirectories: { [workspaceId]: { docs: 'device:previous-inode' } },
        pendingDeletes: {
          [workspaceId]: {
            'docs/note.md': {
              kind: 'markdown',
              path: 'docs/note.md',
              fileId: file.id,
              operationId: 'stable-file-delete-operation',
              baseRevision: 5,
              expectedItemRevision: 4,
              firstObservedAt: 1,
              attempts: 0
            }
          }
        }
      })
    )

    testRuntime.request.mockImplementation(
      async (url: string, options: { method: string; body?: { kind: string; value?: string } }) => {
        if (url.includes('/sync/changes'))
          return {
            status: 200,
            body: { changes: [], hasMore: false, nextRevision: 5, lastRevision: 5, lastFileId: '' }
          }
        if (url.endsWith('/operations') && options.method === 'POST') {
          const payload = JSON.parse(options.body?.value ?? '{}') as {
            operation: { type?: string }
          }
          if (payload.operation.type === 'delete') {
            testRuntime.deleteOperations.push(payload)
            return { status: 409, body: { error: 'file_changed_since_base' } }
          }
        }
        if (url.includes('/sync/tree')) {
          const latest = testRuntime.deleteOperations.length > 0
          const currentFile = latest ? { ...file, revision: 6 } : file
          return {
            status: 200,
            body: {
              revision: latest ? 6 : 5,
              files: [currentFile],
              hasMore: false,
              nextPath: ''
            }
          }
        }
        if (url.endsWith(`/files/${file.id}/updates`))
          return { status: 200, body: { update: latestUpdate, revision: 6 } }
        return { status: 500, body: { error: 'unexpected_mock_request', url } }
      }
    )
  })

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it('restores the latest cloud version and cancels a stale file delete', async () => {
    const result = await scanPkmsSyncBridge(workspaceId)

    expect(testRuntime.deleteOperations).toHaveLength(1)
    await vi.waitFor(async () =>
      expect(await readFile(path.join(root, 'docs/note.md'), 'utf8')).toBe(latestText)
    )
    expect(result.itemStates['docs/note.md']).toBe('attention')

    const state = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingDeletes: Record<string, Record<string, unknown>>
      baselines: Record<string, Record<string, { fileId: string; hash: string; revision: number }>>
    }
    expect(state.pendingDeletes[workspaceId]['docs/note.md']).toBeUndefined()
    expect(state.baselines[workspaceId]['docs/note.md']).toEqual({
      fileId: file.id,
      hash: textHash(latestText),
      revision: 6
    })
  })
})
