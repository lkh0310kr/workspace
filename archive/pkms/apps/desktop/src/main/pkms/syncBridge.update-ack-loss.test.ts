import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as Y from 'yjs'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-update-ack-loss-test-${process.pid}`,
  request: vi.fn(),
  revision: 1,
  changeRequests: 0,
  updateRequests: 0,
  remoteUpdate: ''
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS Markdown update retry after lost acknowledgement', () => {
  const workspaceId = 'update-ack-loss-test'
  const fileId = 'markdown-file'
  const original = '# Original\n'
  const edited = '# Edited\n'
  let root: string
  let remoteDoc: Y.Doc
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const markdownHash = (text: string) => createHash('sha256').update(text).digest('hex')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-update-ack-loss-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'note.md'), edited)
    remoteDoc = new Y.Doc({ guid: fileId })
    remoteDoc.getText('markdown').insert(0, original)
    testRuntime.remoteUpdate = Buffer.from(Y.encodeStateAsUpdate(remoteDoc)).toString('base64')
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        baselines: {
          [workspaceId]: {
            'note.md': { fileId, hash: markdownHash(original), revision: 1 }
          }
        },
        remoteFiles: {
          [workspaceId]: {
            [fileId]: { id: fileId, path: 'note.md', kind: 'markdown', revision: 1 }
          }
        },
        syncCursors: { [workspaceId]: 1 },
        remoteTrees: {
          [workspaceId]: [{ id: fileId, path: 'note.md', kind: 'markdown', revision: 1 }]
        },
        pendingPaths: { [workspaceId]: ['note.md'] }
      })
    )

    testRuntime.request.mockImplementation(
      async (url: string, options: { method: string; body?: { kind: string; value?: string } }) => {
        if (url.includes('/sync/changes')) {
          testRuntime.changeRequests++
          return {
            status: 200,
            body: {
              changes:
                testRuntime.revision === 1
                  ? []
                  : [
                      {
                        id: fileId,
                        path: 'note.md',
                        kind: 'markdown',
                        revision: testRuntime.revision,
                        deleted: false
                      }
                    ],
              hasMore: false,
              nextRevision: testRuntime.revision,
              lastRevision: testRuntime.revision,
              lastFileId: ''
            }
          }
        }
        if (url.endsWith(`/files/${fileId}/updates`) && options.method === 'GET')
          return {
            status: 200,
            body: { update: testRuntime.remoteUpdate, revision: testRuntime.revision }
          }
        if (url.endsWith(`/files/${fileId}/updates`) && options.method === 'POST') {
          const payload = JSON.parse(options.body?.value ?? '{}') as { update: string }
          testRuntime.updateRequests++
          Y.applyUpdate(remoteDoc, new Uint8Array(Buffer.from(payload.update, 'base64')))
          testRuntime.revision++
          testRuntime.remoteUpdate = Buffer.from(Y.encodeStateAsUpdate(remoteDoc)).toString(
            'base64'
          )
          // The server has committed the update, but its acknowledgement is lost.
          throw new TypeError('fetch failed')
        }
        if (url.includes('/sync/download'))
          return {
            status: 200,
            body: {
              documents: [
                {
                  id: fileId,
                  path: 'note.md',
                  revision: testRuntime.revision,
                  text: remoteDoc.getText('markdown').toString()
                }
              ]
            }
          }
        if (url.endsWith('/operations') && options.method === 'POST')
          return { status: 500, body: { error: 'unexpected_duplicate_create' } }
        return { status: 500, body: { error: 'unexpected_mock_request', url } }
      }
    )
  })

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
    remoteDoc.destroy()
  })

  it('accepts the remote ACK by matching content instead of creating a conflict copy', async () => {
    const firstAttempt = await scanPkmsSyncBridge(workspaceId)
    expect(firstAttempt.state).toBe('offline')
    expect(testRuntime.updateRequests).toBe(1)

    const afterLostAck = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingUpdates: Record<string, Record<string, { targetHash: string }>>
    }
    expect(afterLostAck.pendingUpdates[workspaceId][fileId].targetHash).toBe(markdownHash(edited))

    const recovered = await scanPkmsSyncBridge(workspaceId)
    expect(recovered.state).toBe('synced')
    expect(testRuntime.updateRequests).toBe(1)
    expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe(edited)

    const finalState = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingUpdates: Record<string, Record<string, unknown>>
      baselines: Record<string, Record<string, { hash: string; revision: number }>>
    }
    expect(finalState.baselines[workspaceId]['note.md']).toMatchObject({
      hash: markdownHash(edited),
      revision: 2
    })
    expect(finalState.pendingUpdates[workspaceId][fileId]).toBeUndefined()
    expect(
      Object.keys(finalState.baselines[workspaceId]).filter((path) =>
        path.includes('.local-conflict-')
      )
    ).toEqual([])
  })
})
