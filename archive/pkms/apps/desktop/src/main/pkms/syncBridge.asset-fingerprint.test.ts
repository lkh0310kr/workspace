import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-fingerprint-test-${process.pid}`,
  request: vi.fn(),
  uploadedBytes: [] as Uint8Array[]
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS binary asset content fingerprint', () => {
  const workspaceId = 'asset-fingerprint-test'
  const fileId = 'fingerprint-asset'
  const oldBytes = Buffer.from('old bytes')
  const editedBytes = Buffer.from('new bytes')
  let root: string
  let oldFingerprint: string
  const filePath = () => path.join(root, 'image.bin')
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  const gitBlobHash = (bytes: Uint8Array) =>
    createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-asset-fingerprint-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(filePath(), oldBytes)
    const fixedTime = new Date('2020-01-02T03:04:05.000Z')
    await utimes(filePath(), fixedTime, fixedTime)
    const originalStat = await stat(filePath(), { bigint: true })
    oldFingerprint = [
      originalStat.dev,
      originalStat.ino,
      originalStat.size,
      originalStat.mtimeNs,
      originalStat.ctimeNs
    ].join(':')
    const asset = {
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
          [workspaceId]: { 'image.bin': { fileId, hash: sha256(oldBytes), revision: 1 } }
        },
        remoteFiles: { [workspaceId]: { [fileId]: asset } },
        syncCursors: { [workspaceId]: 1 },
        remoteTrees: { [workspaceId]: [asset] },
        assetFingerprints: {
          [workspaceId]: { 'image.bin': { fingerprint: oldFingerprint, hash: sha256(oldBytes) } }
        },
        pendingPaths: { [workspaceId]: ['image.bin'] }
      })
    )

    await writeFile(filePath(), editedBytes)
    await utimes(filePath(), fixedTime, fixedTime)
    const editedStat = await stat(filePath(), { bigint: true })
    expect(editedStat.size).toBe(originalStat.size)
    expect(editedStat.mtimeNs).toBe(originalStat.mtimeNs)
    expect(editedStat.ctimeNs).not.toBe(originalStat.ctimeNs)

    testRuntime.request.mockImplementation(
      async (
        url: string,
        options: { method: string; body?: { kind: string; parts?: Array<{ name: string; bytes?: Uint8Array }> } }
      ) => {
        if (url.includes('/sync/changes'))
          return {
            status: 200,
            body: { changes: [], hasMore: false, nextRevision: 1, lastRevision: 1, lastFileId: '' }
          }
        if (url.endsWith('/upload') && options.method === 'POST') {
          const bytes = options.body?.parts?.find((part) => part.name === 'file')?.bytes
          if (bytes) testRuntime.uploadedBytes.push(bytes)
          return {
            status: 200,
            body: { fileId, path: 'image.bin', acceptedRevision: 2 }
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

  it('hashes and uploads changed bytes when size and mtime still match the cached fingerprint', async () => {
    const result = await scanPkmsSyncBridge(workspaceId)

    expect(result.state).toBe('synced')
    expect(testRuntime.uploadedBytes).toHaveLength(1)
    expect(Buffer.from(testRuntime.uploadedBytes[0])).toEqual(editedBytes)
    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      baselines: Record<string, Record<string, { hash: string; revision: number }>>
      assetFingerprints: Record<string, Record<string, { fingerprint: string; hash: string }>>
    }
    expect(persisted.baselines[workspaceId]['image.bin']).toMatchObject({
      hash: sha256(editedBytes),
      revision: 2
    })
    expect(persisted.assetFingerprints[workspaceId]['image.bin']).toMatchObject({
      hash: sha256(editedBytes)
    })
    expect(persisted.assetFingerprints[workspaceId]['image.bin'].fingerprint).not.toBe(
      oldFingerprint
    )
  })
})
