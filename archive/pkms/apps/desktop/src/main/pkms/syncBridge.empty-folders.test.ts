import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-empty-folders-${process.pid}`,
  request: vi.fn(),
  folders: [] as Array<{ id: string; path: string; kind: string; revision: number }>,
  documents: [] as Array<{ id: string; path: string; kind: string; revision: number }>,
  createRequests: [] as Array<{ path: string; operationId: string }>,
  documentCreates: [] as Array<{ path: string; content: string }>,
  revision: 0
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS empty and dot-prefix folder synchronization', () => {
  const workspaceId = 'empty-folders-test'
  const expectedPaths = ['.hidden', 'empty', '.hidden/nested', 'empty/nested']
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-empty-folders-root-'))
    for (const directory of expectedPaths)
      await mkdir(path.join(root, directory), { recursive: true })
    await writeFile(path.join(root, '.hidden', '.private-note.md'), '# Dot file\n')
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
        if (url.includes('/sync/changes'))
          return {
            status: 200,
            body: {
              changes: [...testRuntime.folders, ...testRuntime.documents].map((file) => ({
                ...file,
                deleted: false
              })),
              hasMore: false,
              nextRevision: testRuntime.revision,
              lastRevision: testRuntime.revision,
              lastFileId: ''
            }
          }
        if (url.includes('/sync/tree'))
          return {
            status: 200,
            body: {
              revision: testRuntime.revision,
              files: [...testRuntime.folders, ...testRuntime.documents],
              hasMore: false,
              nextPath: ''
            }
          }
        if (url.endsWith('/operations') && options.method === 'POST') {
          const payload = JSON.parse(options.body?.value ?? '{}') as {
            operationId: string
            operation: {
              type?: string
              path?: string
              fileId?: string
              content?: string
            }
          }
          if (payload.operation.type === 'create-folder' && payload.operation.path) {
            const folder = {
              id: `folder-${testRuntime.folders.length + 1}`,
              path: payload.operation.path,
              kind: 'folder',
              revision: testRuntime.revision + 1
            }
            testRuntime.createRequests.push({ path: folder.path, operationId: payload.operationId })
            testRuntime.folders.push(folder)
            testRuntime.revision++
            return {
              status: 200,
              body: { fileId: folder.id, path: folder.path, acceptedRevision: testRuntime.revision }
            }
          }
          if (payload.operation.type === 'create-file' && payload.operation.path) {
            const content = payload.operation.content ?? ''
            const document = {
              id: payload.operation.fileId ?? 'unexpected-document-id',
              path: payload.operation.path,
              kind: 'markdown',
              revision: testRuntime.revision + 1
            }
            testRuntime.documentCreates.push({ path: document.path, content })
            testRuntime.documents.push(document)
            testRuntime.revision++
            return {
              status: 200,
              body: { file: document, acceptedRevision: testRuntime.revision }
            }
          }
          return { status: 500, body: { error: 'unexpected_operation' } }
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

  it('syncs empty folders and dot-prefix files/folders, creating folder markers shallowest first', async () => {
    const result = await scanPkmsSyncBridge(workspaceId)

    expect(result.state).toBe('synced')
    expect(testRuntime.createRequests.map((item) => item.path)).toEqual(expectedPaths)
    expect(testRuntime.documentCreates).toEqual([
      { path: '.hidden/.private-note.md', content: '# Dot file\n' }
    ])
    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      remoteTrees: Record<string, Array<{ path: string; kind: string }>>
    }
    expect(persisted.remoteTrees[workspaceId]).toEqual([
      ...expectedPaths.map((folderPath, index) => ({
        id: `folder-${index + 1}`,
        path: folderPath,
        kind: 'folder',
        revision: index + 1
      })),
      expect.objectContaining({
        id: expect.any(String),
        path: '.hidden/.private-note.md',
        kind: 'markdown',
        revision: expectedPaths.length + 1
      })
    ])
  })
})
