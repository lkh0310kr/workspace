import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-root-offline-${process.pid}`,
  request: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS offline local root safety', () => {
  const workspaceId = 'offline-local-root-test'
  let tempParent: string
  let missingRoot: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const previousDirectories = { docs: 'dev:folder-identity', 'docs/nested': 'dev:nested-identity' }

  beforeAll(async () => {
    tempParent = await mkdtemp(path.join(os.tmpdir(), 'pkms-offline-parent-'))
    missingRoot = path.join(tempParent, 'disconnected-folder')
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: missingRoot, excludedPaths: [] } },
        baselines: {
          [workspaceId]: {
            'docs/note.md': { fileId: 'remote-note', hash: 'base-hash', revision: 7 }
          }
        },
        remoteFiles: {
          [workspaceId]: {
            'remote-note': {
              id: 'remote-note',
              path: 'docs/note.md',
              kind: 'markdown',
              revision: 7
            }
          }
        },
        syncCursors: { [workspaceId]: 11 },
        remoteTrees: {
          [workspaceId]: [
            { id: 'folder-docs', path: 'docs', kind: 'folder', revision: 6 },
            { id: 'remote-note', path: 'docs/note.md', kind: 'markdown', revision: 7 }
          ]
        },
        localDirectories: { [workspaceId]: previousDirectories },
        pendingPaths: { [workspaceId]: ['docs/note.md'] }
      })
    )
    testRuntime.request.mockImplementation(async () => {
      throw new Error('cloud must not be consulted for an incomplete local inventory')
    })
  })

  afterAll(async () => {
    await stopPkmsSyncBridges()
    await rm(tempParent, { recursive: true, force: true })
    await rm(testRuntime.userData, { recursive: true, force: true })
  })

  it('does not treat an unavailable local root as delete evidence', async () => {
    const result = await scanPkmsSyncBridge(workspaceId)
    const persisted = JSON.parse(await readFile(stateFile, 'utf8')) as {
      syncCursors: Record<string, number>
      localDirectories: Record<string, Record<string, string>>
      pendingPaths: Record<string, string[]>
      baselines: Record<string, Record<string, { fileId: string; revision: number }>>
    }

    expect(result.state).toBe('offline')
    expect(result.pendingFiles).toBeGreaterThan(0)
    expect(testRuntime.request).not.toHaveBeenCalled()
    expect(persisted.syncCursors[workspaceId]).toBe(11)
    expect(persisted.localDirectories[workspaceId]).toEqual(previousDirectories)
    expect(persisted.pendingPaths[workspaceId]).toContain('docs/note.md')
    expect(persisted.baselines[workspaceId]['docs/note.md']).toMatchObject({
      fileId: 'remote-note',
      revision: 7
    })
  })
})
