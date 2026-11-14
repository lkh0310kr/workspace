import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as Y from 'yjs'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-watcher-recovery-${process.pid}`,
  request: vi.fn(),
  watcher: null as null | {
    emit: (event: string, ...args: unknown[]) => void
    close: ReturnType<typeof vi.fn>
  },
  updateRequests: [] as Array<{ targetHash: string; update: string }>
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
    watch: vi.fn(() => {
      const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
      const watcher = {
        on(event: string, handler: (...args: unknown[]) => void) {
          handlers.set(event, [...(handlers.get(event) ?? []), handler])
          return watcher
        },
        close: vi.fn(),
        emit(event: string, ...args: unknown[]) {
          for (const handler of handlers.get(event) ?? []) handler(...args)
        }
      }
      testRuntime.watcher = watcher
      return watcher
    })
  }
})
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import {
  configurePkmsSyncBridge,
  getPkmsSyncBridgeStatus,
  scanPkmsSyncBridge,
  stopPkmsSyncBridges
} from './syncBridge'

describe('PKMS local watcher recovery', () => {
  const workspaceId = 'watcher-recovery-test'
  const fileId = 'watcher-recovery-note'
  const originalText = '# Baseline\n'
  const editedText = '# Edited after watcher loss\n'
  let root: string
  let remoteUpdate: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const hash = (content: string) => createHash('sha256').update(content).digest('hex')
  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-watcher-recovery-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'note.md'), originalText)
    const remoteDoc = new Y.Doc({ guid: fileId })
    remoteDoc.getText('markdown').insert(0, originalText)
    remoteUpdate = Buffer.from(Y.encodeStateAsUpdate(remoteDoc)).toString('base64')
    const file = { id: fileId, path: 'note.md', kind: 'markdown', revision: 1 }
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        baselines: { [workspaceId]: { 'note.md': { fileId, hash: hash(originalText), revision: 1 } } },
        remoteFiles: { [workspaceId]: { [fileId]: file } },
        syncCursors: { [workspaceId]: 1 },
        remoteTrees: { [workspaceId]: [file] },
        localDirectories: { [workspaceId]: {} }
      })
    )
    testRuntime.request.mockImplementation(
      async (url: string, options: { method: string; body?: { kind: string; value?: string } }) => {
        if (url.includes('/api/realtime/config'))
          return { status: 403, body: { error: 'realtime_disabled_in_fixture' } }
        if (url.includes('/sync/tree'))
          return { status: 200, body: { revision: 1, files: [file], hasMore: false, nextPath: '' } }
        if (url.includes('/sync/download'))
          return {
            status: 200,
            body: { documents: [{ id: fileId, path: 'note.md', revision: 1, text: originalText }] }
          }
        if (url.includes('/sync/changes'))
          return {
            status: 200,
            body: { changes: [], hasMore: false, nextRevision: 1, lastRevision: 1, lastFileId: '' }
          }
        if (url.endsWith(`/files/${fileId}/updates`) && options.method === 'GET')
          return { status: 200, body: { update: remoteUpdate, revision: 1 } }
        if (url.endsWith(`/files/${fileId}/updates`) && options.method === 'POST') {
          const payload = JSON.parse(options.body?.value ?? '{}') as {
            targetHash: string
            update: string
          }
          testRuntime.updateRequests.push(payload)
          return { status: 200, body: { acceptedRevision: 2 } }
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

  it('runs the periodic full scan after a missed watcher event and uploads the edit', async () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    await configurePkmsSyncBridge(workspaceId, root)
    const fullScanCallback = intervalSpy.mock.calls.find(([, delay]) => delay === 15 * 60_000)?.[0]
    intervalSpy.mockRestore()
    expect(fullScanCallback).toBeTypeOf('function')
    await vi.waitFor(
      async () => expect((await getPkmsSyncBridgeStatus(workspaceId)).state).toBe('synced'),
      { timeout: 2_000, interval: 20 }
    )
    expect(testRuntime.watcher).not.toBeNull()

    // Simulate a dropped filesystem event: the file changes, but the watcher callback never fires.
    await writeFile(path.join(root, 'note.md'), editedText)
    ;(fullScanCallback as () => void)()

    await vi.waitFor(() => expect(testRuntime.updateRequests).toHaveLength(1), {
      timeout: 2_000,
      interval: 20
    })
    expect(testRuntime.updateRequests[0].targetHash).toBe(hash(editedText))

    const merged = new Y.Doc({ guid: fileId })
    Y.applyUpdate(merged, Buffer.from(remoteUpdate, 'base64'))
    Y.applyUpdate(merged, Buffer.from(testRuntime.updateRequests[0].update, 'base64'))
    expect(merged.getText('markdown').toString()).toBe(editedText)

    const result = await scanPkmsSyncBridge(workspaceId)
    expect(result.state).toBe('synced')
    expect(result.itemStates['note.md']).toBe('synced')
  })
})
