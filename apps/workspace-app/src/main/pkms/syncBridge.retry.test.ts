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
  const serverErrorWorkspaceId = 'server-error-retry-test'
  const unauthorizedWorkspaceId = 'unauthorized-no-retry-test'
  const forbiddenWorkspaceId = 'forbidden-no-retry-test'
  let root: string
  let offlineRoot: string
  let serverErrorRoot: string
  let unauthorizedRoot: string
  let forbiddenRoot: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-retry-root-'))
    offlineRoot = await mkdtemp(path.join(os.tmpdir(), 'pkms-offline-root-'))
    serverErrorRoot = await mkdtemp(path.join(os.tmpdir(), 'pkms-server-error-root-'))
    unauthorizedRoot = await mkdtemp(path.join(os.tmpdir(), 'pkms-unauthorized-root-'))
    forbiddenRoot = await mkdtemp(path.join(os.tmpdir(), 'pkms-forbidden-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'pending.md'), '# pending\n')
    await writeFile(path.join(offlineRoot, 'offline.md'), '# offline\n')
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: {
          [workspaceId]: { folderPath: root, excludedPaths: [] },
          [offlineWorkspaceId]: { folderPath: offlineRoot, excludedPaths: [] },
          [serverErrorWorkspaceId]: { folderPath: serverErrorRoot, excludedPaths: [] },
          [unauthorizedWorkspaceId]: { folderPath: unauthorizedRoot, excludedPaths: [] },
          [forbiddenWorkspaceId]: { folderPath: forbiddenRoot, excludedPaths: [] }
        },
        pendingPaths: {
          [workspaceId]: ['pending.md'],
          [offlineWorkspaceId]: ['offline.md'],
          [serverErrorWorkspaceId]: ['server-error.md'],
          [unauthorizedWorkspaceId]: ['unauthorized.md'],
          [forbiddenWorkspaceId]: ['forbidden.md']
        }
      })
    )
    await writeFile(path.join(serverErrorRoot, 'server-error.md'), '# server error\n')
    await writeFile(path.join(unauthorizedRoot, 'unauthorized.md'), '# unauthorized\n')
    await writeFile(path.join(forbiddenRoot, 'forbidden.md'), '# forbidden\n')
    testRuntime.request.mockImplementation(async (url: string) => {
      if (url.includes(offlineWorkspaceId)) throw new TypeError('fetch failed')
      if (url.includes(serverErrorWorkspaceId)) return { status: 503, body: { error: 'db_busy' } }
      if (url.includes(unauthorizedWorkspaceId)) return { status: 401, body: { error: 'expired' } }
      if (url.includes(forbiddenWorkspaceId)) return { status: 403, body: { error: 'forbidden' } }
      return { status: 429, body: { error: 'worker_limit_exceeded' } }
    })
  })

  afterAll(async () => {
    await disconnectPkmsSyncBridge(workspaceId)
    await disconnectPkmsSyncBridge(offlineWorkspaceId)
    await disconnectPkmsSyncBridge(serverErrorWorkspaceId)
    await disconnectPkmsSyncBridge(unauthorizedWorkspaceId)
    await disconnectPkmsSyncBridge(forbiddenWorkspaceId)
    await stopPkmsSyncBridges()
    await rm(root, { recursive: true, force: true })
    await rm(offlineRoot, { recursive: true, force: true })
    await rm(serverErrorRoot, { recursive: true, force: true })
    await rm(unauthorizedRoot, { recursive: true, force: true })
    await rm(forbiddenRoot, { recursive: true, force: true })
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

  it('backs off on HTTP 5xx while preserving pending work', async () => {
    const failed = await scanPkmsSyncBridge(serverErrorWorkspaceId)
    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingPaths: Record<string, string[]>
    }

    expect(failed.state).toBe('syncing')
    expect(persisted.pendingPaths[serverErrorWorkspaceId]).toContain('server-error.md')
    const beforeBackoff = testRuntime.request.mock.calls.filter(([url]) =>
      String(url).includes(serverErrorWorkspaceId)
    )
    expect(beforeBackoff).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(
      testRuntime.request.mock.calls.filter(([url]) => String(url).includes(serverErrorWorkspaceId))
    ).toHaveLength(1)
    await vi.waitFor(
      () =>
        expect(
          testRuntime.request.mock.calls.filter(([url]) =>
            String(url).includes(serverErrorWorkspaceId)
          )
        ).toHaveLength(2),
      { timeout: 2_000, interval: 20 }
    )
    await disconnectPkmsSyncBridge(serverErrorWorkspaceId)
  })

  it.each([
    [unauthorizedWorkspaceId, 'unauthorized.md', 'expired'],
    [forbiddenWorkspaceId, 'forbidden.md', 'forbidden']
  ])('keeps HTTP auth/permission failures visible without retrying (%s)', async (id, file, error) => {
    const failed = await scanPkmsSyncBridge(id)
    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      pendingPaths: Record<string, string[]>
    }
    expect(failed.state).toBe('error')
    expect(failed.error).toBe(error)
    expect(persisted.pendingPaths[id]).toContain(file)

    const callsBeforeDelay = testRuntime.request.mock.calls.filter(([url]) => String(url).includes(id))
    expect(callsBeforeDelay).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(testRuntime.request.mock.calls.filter(([url]) => String(url).includes(id))).toHaveLength(1)
    await disconnectPkmsSyncBridge(id)
  })
})
