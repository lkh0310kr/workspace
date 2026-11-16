import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcHarness = vi.hoisted(() => ({
  handlers: [] as Array<{ channel: string; handler: unknown }>,
  calls: [] as string[],
  startConfiguredPkmsSyncBridges: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: vi.fn((channel: string, handler: unknown) => {
      ipcHarness.calls.push(channel)
      ipcHarness.handlers.push({ channel, handler })
    })
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
    showItemInFolder: vi.fn()
  }
}))

vi.mock('./api', () => ({
  fetchPkmsAsset: vi.fn(),
  parsePkmsVerificationUrl: vi.fn(),
  parseServiceOAuthUrl: vi.fn(),
  requestPkmsApi: vi.fn(),
  requestWorkspaceHomeApi: vi.fn()
}))

vi.mock('./syncBridge', () => ({
  configurePkmsSyncBridge: vi.fn(),
  createPkmsLocalItem: vi.fn(),
  deletePkmsLocalItems: vi.fn(),
  disconnectPkmsSyncBridge: vi.fn(),
  getPkmsSyncBridgeStatus: vi.fn(),
  getPkmsSyncBridgeTree: vi.fn(),
  getPkmsLocalFile: vi.fn(),
  listPkmsLocalDirectory: vi.fn(),
  movePkmsLocalItems: vi.fn(),
  readPkmsLocalMarkdown: vi.fn(),
  renamePkmsLocalItem: vi.fn(),
  resolvePkmsLocalItemAbsolutePath: vi.fn(),
  scanPkmsSyncBridge: vi.fn(),
  startConfiguredPkmsSyncBridges: () => {
    ipcHarness.calls.push('start-configured-sync-bridges')
    ipcHarness.startConfiguredPkmsSyncBridges()
  },
  updatePkmsSyncBridgeExclusions: vi.fn(),
  writePkmsLocalMarkdown: vi.fn()
}))

vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn() }))
vi.mock('./googleDriveDesktopOAuthRuntime', () => ({
  googleDriveDesktopOAuth: { connect: vi.fn(), disconnect: vi.fn() },
  googleDriveDesktopOAuthConfiguration: vi.fn()
}))
vi.mock('./googleDriveDesktopWorkspace', () => ({
  GoogleDriveDesktopWorkspaceService: class {}
}))

import { registerPkmsIpc } from './ipc'

const EXPECTED_CHANNELS = [
  'pkms-google-drive:oauth:status',
  'pkms-google-drive:oauth:connect',
  'pkms-google-drive:oauth:disconnect',
  'pkms-google-drive:workspace:roots',
  'pkms-google-drive:workspace:create-root',
  'pkms-google-drive:workspace:connect',
  'pkms-google-drive:workspace:directory',
  'pkms-google-drive:workspace:search',
  'pkms-google-drive:workspace:open-markdown',
  'pkms-google-drive:workspace:read-asset',
  'pkms-google-drive:workspace:save-markdown',
  'pkms-google-drive:workspace:sync',
  'pkms-google-drive:workspace:create',
  'pkms-google-drive:workspace:rename',
  'pkms-google-drive:workspace:trash',
  'pkms-google-drive:workspace:move',
  'pkms-google-drive:workspace:disconnect',
  'pkms:request',
  'pkms:fetch-asset',
  'pkms:sync-bridge:status',
  'pkms:sync-bridge:tree',
  'pkms:sync-bridge:connect',
  'pkms:sync-bridge:disconnect',
  'pkms:sync-bridge:scan',
  'pkms:sync-bridge:exclusions',
  'pkms:local-file:read',
  'pkms:local-file:list',
  'pkms:local-file:get',
  'pkms:local-item:reveal',
  'pkms:local-item:create',
  'pkms:local-item:rename',
  'pkms:local-item:move',
  'pkms:local-item:delete',
  'pkms:local-file:write',
  'workspace-home:request',
  'pkms:open-verification',
  'pkms:open-service-oauth'
]

function handlerFor(channel: string): (...args: unknown[]) => unknown {
  const handler = ipcHarness.handlers.find((entry) => entry.channel === channel)?.handler
  if (typeof handler !== 'function') throw new Error(`IPC handler missing: ${channel}`)
  return handler as (...args: unknown[]) => unknown
}

const trustedEvent = {
  senderFrame: { url: 'file:///workspace/index.html' },
  sender: {}
}

describe('PKMS IPC registration', () => {
  beforeEach(() => {
    ipcHarness.handlers.length = 0
    ipcHarness.calls.length = 0
    ipcHarness.startConfiguredPkmsSyncBridges.mockClear()
  })

  it('registers every Drive and legacy channel once in the original order', () => {
    registerPkmsIpc()

    expect(ipcHarness.handlers.map(({ channel }) => channel)).toEqual(EXPECTED_CHANNELS)
    expect(new Set(ipcHarness.handlers.map(({ channel }) => channel)).size).toBe(
      EXPECTED_CHANNELS.length
    )
    expect(ipcHarness.calls[0]).toBe('start-configured-sync-bridges')
    expect(ipcHarness.startConfiguredPkmsSyncBridges).toHaveBeenCalledTimes(1)
  })

  it('keeps sender and Drive/workspace ID guards on their existing handlers', async () => {
    registerPkmsIpc()

    expect(() =>
      handlerFor('pkms-google-drive:oauth:status')({
        senderFrame: { url: 'https://untrusted.example/' },
        sender: {}
      })
    ).toThrow('untrusted_renderer')
    expect(() =>
      handlerFor('pkms-google-drive:workspace:connect')(trustedEvent, '../../root')
    ).toThrow('invalid_google_drive_id')
    await expect(
      handlerFor('pkms:sync-bridge:connect')(trustedEvent, '../workspace')
    ).rejects.toThrow('invalid_workspace_id')
  })
})
