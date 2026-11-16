import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const testUserData = vi.hoisted(() => `/tmp/workspace-pkms-state-test-${process.pid}`)
vi.mock('electron', () => ({
  app: { getPath: () => testUserData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: vi.fn(), fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS durable state corruption handling', () => {
  const stateFile = path.join(testUserData, 'pkms-sync-bridge.json')

  beforeAll(async () => {
    await mkdir(testUserData, { recursive: true })
  })

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(testUserData, { recursive: true, force: true })
  })

  it('refuses malformed or structurally invalid state without overwriting the file', async () => {
    for (const damaged of ['{"configs":', '{"configs":[]}']) {
      await writeFile(stateFile, damaged)

      await expect(scanPkmsSyncBridge('corrupt-state-test')).rejects.toThrow(
        'pkms_sync_state_corrupt'
      )
      expect(await readFile(stateFile, 'utf8')).toBe(damaged)
    }
  })
})
