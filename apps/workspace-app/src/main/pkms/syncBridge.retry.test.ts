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
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-retry-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'pending.md'), '# pending\n')
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        pendingPaths: { [workspaceId]: ['pending.md'] }
      })
    )
    testRuntime.request.mockImplementation(async () => ({
      status: 429,
      body: { error: 'worker_limit_exceeded' }
    }))
  })

  afterAll(async () => {
    await disconnectPkmsSyncBridge(workspaceId)
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
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
    await vi.waitFor(() => expect(testRuntime.request).toHaveBeenCalledTimes(2), {
      timeout: 3_000,
      interval: 20
    })

    await disconnectPkmsSyncBridge(workspaceId)
  })
})
