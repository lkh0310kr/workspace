import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-restart-test-${process.pid}`,
  request: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

describe('PKMS durable state restart recovery', () => {
  const workspaceId = 'restart-recovery-test'
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-restart-root-'))
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(path.join(root, 'pending.md'), '# local pending\n')
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        syncCursors: { [workspaceId]: 42 },
        pendingPaths: { [workspaceId]: ['pending.md'] },
        itemStates: { [workspaceId]: { 'pending.md': 'pending' } }
      })
    )
    testRuntime.request.mockImplementation(async () => {
      throw new Error('network must not be reached before the restored state is inspected')
    })
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it('restores the configured root, cursor, pending path, and item state after module restart', async () => {
    const firstRun = await import('./syncBridge')
    await firstRun.startConfiguredPkmsSyncBridges()
    await firstRun.stopPkmsSyncBridges()

    vi.resetModules()
    const restartedRun = await import('./syncBridge')
    const restoredStatus = await restartedRun.getPkmsSyncBridgeStatus(workspaceId)

    expect(restoredStatus.enabled).toBe(true)
    expect(restoredStatus.folderPath).toBe(root)
    expect(restoredStatus.itemStates['pending.md']).toBe('pending')
    expect(testRuntime.request.mock.calls.length).toBeGreaterThan(0)
    expect(testRuntime.request.mock.calls.every(([url]) => url === '/api/realtime/config')).toBe(
      true
    )

    await restartedRun.stopPkmsSyncBridges()
    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      syncCursors: Record<string, number>
      pendingPaths: Record<string, string[]>
      itemStates: Record<string, Record<string, string>>
    }
    expect(persisted.syncCursors[workspaceId]).toBe(42)
    expect(persisted.pendingPaths[workspaceId]).toEqual(['pending.md'])
    expect(persisted.itemStates[workspaceId]['pending.md']).toBe('pending')
  })
})
