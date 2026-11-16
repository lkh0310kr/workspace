import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-pagination-test-${process.pid}`,
  request: vi.fn(),
  failSecondPage: true,
  pageRequests: 0
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS cursor pagination recovery', () => {
  const workspaceId = 'pagination-recovery-test'
  const file = { id: 'note-file', path: 'note.md', kind: 'markdown', revision: 6 }
  const oldText = '# Before page failure\n'
  const latestText = '# After page recovery\n'
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const textHash = (text: string) => createHash('sha256').update(text).digest('hex')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-pagination-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'note.md'), oldText)
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        baselines: {
          [workspaceId]: {
            'note.md': { fileId: file.id, hash: textHash(oldText), revision: 5 }
          }
        },
        remoteFiles: {
          [workspaceId]: {
            [file.id]: { ...file, revision: 5 }
          }
        },
        syncCursors: { [workspaceId]: 5 },
        remoteTrees: { [workspaceId]: [{ ...file, revision: 5 }] }
      })
    )
    testRuntime.request.mockImplementation(async (url: string, options: { method: string }) => {
      if (url.includes('/sync/changes')) {
        testRuntime.pageRequests++
        const query = new URL(`http://localhost${url}`).searchParams
        if (!query.get('lastFileId'))
          return {
            status: 200,
            body: {
              changes: [{ ...file, deleted: false }],
              hasMore: true,
              nextRevision: 5,
              lastRevision: 6,
              lastFileId: file.id
            }
          }
        if (testRuntime.failSecondPage) throw new TypeError('fetch failed')
        return {
          status: 200,
          body: {
            changes: [],
            hasMore: false,
            nextRevision: 6,
            lastRevision: 6,
            lastFileId: file.id
          }
        }
      }
      if (url.includes('/sync/download') && options.method === 'POST')
        return {
          status: 200,
          body: { documents: [{ ...file, text: latestText }] }
        }
      return { status: 500, body: { error: 'unexpected_mock_request', url } }
    })
  })

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it('keeps the old cursor when a later page fails and replays the feed on recovery', async () => {
    const failed = await scanPkmsSyncBridge(workspaceId)
    expect(failed.state).toBe('offline')
    expect(testRuntime.pageRequests).toBe(2)

    const afterFailure = JSON.parse(await readFile(stateFile, 'utf8')) as {
      syncCursors: Record<string, number>
      remoteFiles: Record<string, Record<string, { revision: number }>>
    }
    expect(afterFailure.syncCursors[workspaceId]).toBe(5)
    expect(afterFailure.remoteFiles[workspaceId][file.id].revision).toBe(5)

    testRuntime.failSecondPage = false
    const recovered = await scanPkmsSyncBridge(workspaceId)
    expect(recovered.state).toBe('synced')
    expect(testRuntime.pageRequests).toBe(4)
    expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe(latestText)

    const finalState = JSON.parse(await readFile(stateFile, 'utf8')) as {
      syncCursors: Record<string, number>
      baselines: Record<string, Record<string, { revision: number; hash: string }>>
    }
    expect(finalState.syncCursors[workspaceId]).toBe(6)
    expect(finalState.baselines[workspaceId]['note.md']).toMatchObject({
      revision: 6,
      hash: textHash(latestText)
    })
  })
})
