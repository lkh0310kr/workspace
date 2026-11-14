import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-item-isolation-${process.pid}`,
  request: vi.fn(),
  uploads: [] as Array<{ path: string; bytes: Uint8Array }>
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS item-level sync failure isolation', () => {
  const workspaceId = 'item-isolation-test'
  const rootBytes = Buffer.from('root original')
  const rootEdit = Buffer.from('root updated')
  const leafBytes = Buffer.from('leaf original')
  const leafEdit = Buffer.from('leaf updated')
  const ids = { broken: 'asset-broken', successful: 'asset-successful' }
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  const gitBlobHash = (bytes: Uint8Array) =>
    createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-item-isolation-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'a-broken.bin'), rootEdit)
    await writeFile(path.join(root, 'b-successful.bin'), leafEdit)
    const assets = [
      {
        id: ids.broken,
        path: 'a-broken.bin',
        kind: 'asset',
        revision: 1,
        size: rootBytes.byteLength,
        sha: gitBlobHash(rootBytes)
      },
      {
        id: ids.successful,
        path: 'b-successful.bin',
        kind: 'asset',
        revision: 1,
        size: leafBytes.byteLength,
        sha: gitBlobHash(leafBytes)
      }
    ]
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        baselines: {
          [workspaceId]: {
            'a-broken.bin': { fileId: ids.broken, hash: sha256(rootBytes), revision: 1 },
            'b-successful.bin': { fileId: ids.successful, hash: sha256(leafBytes), revision: 1 }
          }
        },
        remoteFiles: {
          [workspaceId]: Object.fromEntries(assets.map((asset) => [asset.id, asset]))
        },
        syncCursors: { [workspaceId]: 1 },
        remoteTrees: { [workspaceId]: assets },
        pendingPaths: { [workspaceId]: ['a-broken.bin', 'b-successful.bin'] }
      })
    )
    testRuntime.request.mockImplementation(
      async (
        url: string,
        options: { method: string; body?: { kind: string; parts?: Array<{ name: string; value?: string; bytes?: Uint8Array }> } }
      ) => {
        if (url.includes('/sync/changes'))
          return {
            status: 200,
            body: { changes: [], hasMore: false, nextRevision: 1, lastRevision: 1, lastFileId: '' }
          }
        if (url.endsWith('/upload') && options.method === 'POST') {
          const parts = options.body?.parts ?? []
          const assetPath = parts.find((part) => part.name === 'path')?.value ?? ''
          const bytes = parts.find((part) => part.name === 'file')?.bytes ?? new Uint8Array()
          testRuntime.uploads.push({ path: assetPath, bytes })
          if (assetPath === 'a-broken.bin')
            return { status: 403, body: { error: 'asset_permission_denied' } }
          return {
            status: 200,
            body: { fileId: ids.successful, path: assetPath, acceptedRevision: 2 }
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

  it('acks the successful item while preserving the failed item as attention', async () => {
    const result = await scanPkmsSyncBridge(workspaceId)

    expect(result.state).toBe('error')
    expect(result.itemStates['a-broken.bin']).toBe('attention')
    expect(result.itemStates['b-successful.bin']).toBe('synced')
    expect(testRuntime.uploads.map((upload) => upload.path).sort()).toEqual([
      'a-broken.bin',
      'b-successful.bin'
    ])
    expect(
      Buffer.from(testRuntime.uploads.find((upload) => upload.path === 'b-successful.bin')!.bytes)
    ).toEqual(leafEdit)

    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      baselines: Record<string, Record<string, { hash: string; revision: number }>>
      pendingPaths: Record<string, string[]>
    }
    expect(persisted.baselines[workspaceId]['a-broken.bin']).toMatchObject({
      hash: sha256(rootBytes),
      revision: 1
    })
    expect(persisted.baselines[workspaceId]['b-successful.bin']).toMatchObject({
      hash: sha256(leafEdit),
      revision: 2
    })
    expect(persisted.pendingPaths[workspaceId]).toEqual(['a-broken.bin', 'b-successful.bin'])
  })
})
