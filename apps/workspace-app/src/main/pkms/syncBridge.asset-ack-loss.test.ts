import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-asset-ack-loss-${process.pid}`,
  request: vi.fn(),
  fetchAsset: vi.fn(),
  uploadRequests: [] as Array<{ path: string; operationId: string; fileId?: string }>,
  asset: null as null | {
    id: string
    path: string
    kind: string
    revision: number
    size: number
    sha: string
  }
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({
  requestPkmsApi: testRuntime.request,
  fetchPkmsAsset: testRuntime.fetchAsset
}))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS binary asset update retry after lost acknowledgement', () => {
  const workspaceId = 'asset-ack-loss-test'
  const fileId = 'asset-file'
  const oldBytes = Buffer.from('old asset bytes')
  const currentBytes = Buffer.from('new asset bytes')
  let root: string
  let currentRevision = 1
  let changeRequests = 0
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const contentHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  const gitBlobHash = (bytes: Uint8Array) =>
    createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-asset-ack-loss-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'image.bin'), currentBytes)
    testRuntime.asset = {
      id: fileId,
      path: 'image.bin',
      kind: 'asset',
      revision: 1,
      size: oldBytes.byteLength,
      sha: gitBlobHash(oldBytes)
    }
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        baselines: {
          [workspaceId]: {
            'image.bin': { fileId, hash: contentHash(oldBytes), revision: 1 }
          }
        },
        remoteFiles: { [workspaceId]: { [fileId]: testRuntime.asset } },
        syncCursors: { [workspaceId]: 1 },
        remoteTrees: { [workspaceId]: [testRuntime.asset] },
        pendingPaths: { [workspaceId]: ['image.bin'] }
      })
    )
    testRuntime.fetchAsset.mockResolvedValue({ bytes: oldBytes })
    testRuntime.request.mockImplementation(
      async (
        url: string,
        options: { method: string; body?: { kind: string; parts?: unknown[] } }
      ) => {
        if (url.includes('/sync/changes')) {
          changeRequests++
          const updated = currentRevision > 1
          return {
            status: 200,
            body: {
              changes:
                updated && testRuntime.asset ? [{ ...testRuntime.asset, deleted: false }] : [],
              hasMore: false,
              nextRevision: currentRevision,
              lastRevision: currentRevision,
              lastFileId: ''
            }
          }
        }
        if (url.endsWith('/upload') && options.method === 'POST') {
          const parts = options.body?.parts as Array<{ name: string; value?: string }> | undefined
          const value = (name: string) => parts?.find((part) => part.name === name)?.value
          testRuntime.uploadRequests.push({
            path: value('path') ?? '',
            operationId: value('operationId') ?? '',
            ...(value('fileId') ? { fileId: value('fileId') } : {})
          })
          if (testRuntime.uploadRequests.length > 1)
            return { status: 500, body: { error: 'unexpected_duplicate_asset_upload' } }
          currentRevision = 2
          testRuntime.asset = {
            id: fileId,
            path: 'image.bin',
            kind: 'asset',
            revision: currentRevision,
            size: currentBytes.byteLength,
            sha: gitBlobHash(currentBytes)
          }
          // The server commits the object and metadata before the response is lost.
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

  it('recognizes the committed asset by its content hash without uploading a duplicate', async () => {
    const firstAttempt = await scanPkmsSyncBridge(workspaceId)
    expect(firstAttempt.state).toBe('offline')
    expect(testRuntime.uploadRequests).toHaveLength(1)
    expect(testRuntime.uploadRequests[0]).toMatchObject({ path: 'image.bin', fileId })

    const recovered = await scanPkmsSyncBridge(workspaceId)
    expect(recovered.state).toBe('synced')
    expect(testRuntime.uploadRequests).toHaveLength(1)
    expect(await readFile(path.join(root, 'image.bin'))).toEqual(currentBytes)

    const state = JSON.parse(await readFile(stateFile, 'utf8')) as {
      baselines: Record<string, Record<string, { fileId: string; hash: string; revision: number }>>
    }
    expect(state.baselines[workspaceId]['image.bin']).toMatchObject({
      fileId,
      hash: contentHash(currentBytes),
      revision: 2
    })
    expect(
      Object.keys(state.baselines[workspaceId]).filter((item) => item.includes('.local-conflict-'))
    ).toEqual([])
  })
})
