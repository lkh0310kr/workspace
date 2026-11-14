import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-unchanged-asset-${process.pid}`,
  assetRootPrefix: '',
  assetReadCount: 0,
  request: vi.fn(),
  fetchAsset: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const readFileTracked: typeof actual.promises.readFile = ((
    file: Parameters<typeof actual.promises.readFile>[0],
    ...args: never[]
  ) => {
    if (String(file).startsWith(testRuntime.assetRootPrefix)) testRuntime.assetReadCount++
    return actual.promises.readFile(file, ...args)
  }) as typeof actual.promises.readFile
  return {
    ...actual,
    promises: { ...actual.promises, readFile: readFileTracked }
  }
})
vi.mock('./api', () => ({
  requestPkmsApi: testRuntime.request,
  fetchPkmsAsset: testRuntime.fetchAsset
}))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS unchanged binary asset scans', () => {
  const workspaceId = 'unchanged-asset-scan-test'
  const bytes = Buffer.from('immutable test asset bytes')
  const assetCount = 5_633
  const folderCount = 100
  const revision = 8
  const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
  const gitBlobSha = (value: Uint8Array) =>
    createHash('sha1').update(`blob ${value.byteLength}\0`).update(value).digest('hex')
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  let root: string
  let localFilePaths: string[] = []

  beforeAll(
    async () => {
      root = await mkdtemp(path.join(os.tmpdir(), 'pkms-unchanged-assets-root-'))
      await mkdir(testRuntime.userData, { recursive: true })
      testRuntime.assetRootPrefix = `${root}${path.sep}`

      const localDirectories: Record<string, string> = {}
      const folderRows: Array<{
        id: string
        path: string
        kind: 'folder'
        revision: number
      }> = []
      for (let index = 0; index < folderCount; index++) {
        const folderPath = `folder-${String(index).padStart(3, '0')}`
        const absolutePath = path.join(root, folderPath)
        await mkdir(absolutePath, { recursive: true })
        const folderStat = await stat(absolutePath, { bigint: true })
        localDirectories[folderPath] = `${folderStat.dev}:${folderStat.ino}`
        folderRows.push({
          id: `folder-${index}`,
          path: folderPath,
          kind: 'folder' as const,
          revision
        })
      }

      const assetPaths = Array.from({ length: assetCount }, (_, index) => {
        const folderIndex = Math.min(Math.floor(index / 57), folderCount - 1)
        return `${`folder-${String(folderIndex).padStart(3, '0')}`}/asset-${String(index).padStart(5, '0')}.bin`
      })
      localFilePaths = assetPaths.map((relative) => path.join(root, relative))
      for (let offset = 0; offset < localFilePaths.length; offset += 200) {
        await Promise.all(
          localFilePaths.slice(offset, offset + 200).map((filePath) => writeFile(filePath, bytes))
        )
      }

      const localHash = sha256(bytes)
      const localGitBlobSha = gitBlobSha(bytes)
      const baselines: Record<string, { fileId: string; hash: string; revision: number }> = {}
      const remoteFiles: Record<string, object> = {}
      const fingerprints: Record<
        string,
        { fingerprint: string; hash: string; gitBlobSha: string }
      > = {}
      const assetRows: Array<{
        id: string
        path: string
        kind: 'asset'
        revision: number
        size: number
        sha: string
      }> = []
      for (let index = 0; index < assetCount; index++) {
        const relative = assetPaths[index]
        const id = `asset-${index}`
        const fileStat = await stat(localFilePaths[index], { bigint: true })
        const fingerprint = [
          fileStat.dev,
          fileStat.ino,
          fileStat.size,
          fileStat.mtimeNs,
          fileStat.ctimeNs
        ].join(':')
        const asset = {
          id,
          path: relative,
          kind: 'asset' as const,
          revision,
          size: bytes.byteLength,
          sha: localGitBlobSha
        }
        baselines[relative] = { fileId: id, hash: localHash, revision }
        remoteFiles[id] = asset
        // Existing persisted records only contain fingerprint + SHA-256. The
        // first scan should warm the Git blob hash, then later scans reuse it.
        fingerprints[relative] = { fingerprint, hash: localHash, gitBlobSha: '' }
        assetRows.push(asset)
      }

      await writeFile(
        stateFile,
        JSON.stringify({
          configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
          baselines: { [workspaceId]: baselines },
          remoteFiles: { [workspaceId]: remoteFiles },
          syncCursors: { [workspaceId]: revision },
          remoteTrees: { [workspaceId]: [...folderRows, ...assetRows] },
          localDirectories: { [workspaceId]: localDirectories },
          assetFingerprints: { [workspaceId]: fingerprints }
        })
      )

      testRuntime.request.mockImplementation(async (url: string) => {
        if (url.includes('/sync/changes'))
          return {
            status: 200,
            body: {
              changes: [],
              hasMore: false,
              nextRevision: revision,
              lastRevision: revision,
              lastFileId: ''
            }
          }
        return { status: 500, body: { error: `unexpected_request:${url}` } }
      })
    },
    60_000
  )

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it(
    'warms old fingerprints once, then avoids rereading bytes in a 5,733-item tree',
    async () => {
      testRuntime.assetReadCount = 0
      const warmupStartedAt = performance.now()
      const warmupResult = await scanPkmsSyncBridge(workspaceId)
      const warmupElapsedMs = performance.now() - warmupStartedAt
      const warmupReadCount = testRuntime.assetReadCount
      testRuntime.assetReadCount = 0
      const startedAt = performance.now()
      const result = await scanPkmsSyncBridge(workspaceId)
      const elapsedMs = performance.now() - startedAt

      expect(warmupResult.state).toBe('synced')
      expect(warmupReadCount).toBe(assetCount)
      expect(result.state).toBe('synced')
      expect(result.pendingFiles).toBe(0)
      expect(testRuntime.assetReadCount).toBe(0)
      expect(testRuntime.fetchAsset).not.toHaveBeenCalled()
      expect(
        testRuntime.request.mock.calls.some(
          ([url, options]) =>
            url.endsWith('/upload') || (url.endsWith('/operations') && options.method === 'POST')
        )
      ).toBe(false)
      expect(await readFile(localFilePaths[0])).toEqual(bytes)
      console.info(
        `5,733-item unchanged scans: warmup ${warmupElapsedMs.toFixed(1)} ms / ${warmupReadCount} reads; cached ${elapsedMs.toFixed(1)} ms / ${testRuntime.assetReadCount} reads`
      )
    },
    60_000
  )
})
