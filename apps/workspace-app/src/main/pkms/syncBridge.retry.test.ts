import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-retry-test-${process.pid}`,
  request: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { disconnectPkmsSyncBridge, scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS retryable HTTP failures', () => {
  const workspaceId = 'retry-status-test'
  const offlineWorkspaceId = 'offline-no-loop-test'
  let root: string
  let offlineRoot: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-retry-root-'))
    offlineRoot = await mkdtemp(path.join(os.tmpdir(), 'pkms-offline-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'pending.md'), '# pending\n')
    await writeFile(path.join(offlineRoot, 'offline.md'), '# offline\n')
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: {
          [workspaceId]: { folderPath: root, excludedPaths: [] },
          [offlineWorkspaceId]: { folderPath: offlineRoot, excludedPaths: [] }
        },
        pendingPaths: {
          [workspaceId]: ['pending.md'],
          [offlineWorkspaceId]: ['offline.md']
        }
      })
    )
    testRuntime.request.mockImplementation(async (url: string) => {
      if (url.includes(offlineWorkspaceId)) throw new TypeError('fetch failed')
      return { status: 429, body: { error: 'worker_limit_exceeded' } }
    })
  })

  afterAll(async () => {
    await disconnectPkmsSyncBridge(workspaceId)
    await disconnectPkmsSyncBridge(offlineWorkspaceId)
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
    await rm(offlineRoot, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it('retries HTTP 429 even when the response code omits rate-limit wording', async () => {
    const failed = await scanPkmsSyncBridge(workspaceId)

    expect(testRuntime.request).toHaveBeenCalledTimes(1)
    expect(failed.state).toBe('syncing')
    expect(failed.error).toBeNull()
    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingPaths: Record<string, string[]>
    }
    expect(persisted.pendingPaths[workspaceId]).toContain('pending.md')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(testRuntime.request).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(testRuntime.request).toHaveBeenCalledTimes(2), {
      timeout: 2_000,
      interval: 20
    })

    await disconnectPkmsSyncBridge(workspaceId)
  })

  it('does not immediately reschedule a generic offline scan failure', async () => {
    const offline = await scanPkmsSyncBridge(offlineWorkspaceId)
    expect(offline.state).toBe('offline')
    const calls = testRuntime.request.mock.calls.filter(([url]) =>
      String(url).includes(offlineWorkspaceId)
    )
    expect(calls).toHaveLength(1)

    await new Promise((resolve) => setTimeout(resolve, 100))
    const afterDelay = testRuntime.request.mock.calls.filter(([url]) =>
      String(url).includes(offlineWorkspaceId)
    )
    expect(afterDelay).toHaveLength(1)
    await disconnectPkmsSyncBridge(offlineWorkspaceId)
  })
})
