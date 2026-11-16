import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-unchanged-markdown-${process.pid}`,
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

describe('PKMS unchanged Markdown scans', () => {
  const workspaceId = 'unchanged-markdown-scan-test'
  const content = '# Stable note\n\nNo content changed.\n'
  const noteCount = 3_706
  const folderCount = 100
  const revision = 8
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  let root: string

  beforeAll(
    async () => {
      root = await mkdtemp(path.join(os.tmpdir(), 'pkms-unchanged-markdown-root-'))
      await mkdir(testRuntime.userData, { recursive: true })
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
          kind: 'folder',
          revision
        })
      }

      const baselines: Record<string, { fileId: string; hash: string; revision: number }> = {}
      const remoteFiles: Record<string, object> = {}
      const noteRows: Array<{
        id: string
        path: string
        kind: 'markdown'
        revision: number
      }> = []
      for (let index = 0; index < noteCount; index++) {
        const folderIndex = Math.floor(index / 38)
        const relative = `folder-${String(folderIndex).padStart(3, '0')}/note-${String(index).padStart(5, '0')}.md`
        const id = `note-${index}`
        const absolutePath = path.join(root, relative)
        await writeFile(absolutePath, content)
        const note = { id, path: relative, kind: 'markdown' as const, revision }
        baselines[relative] = { fileId: id, hash: hash(content), revision }
        remoteFiles[id] = note
        noteRows.push(note)
      }

      await writeFile(
        stateFile,
        JSON.stringify({
          configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
          baselines: { [workspaceId]: baselines },
          remoteFiles: { [workspaceId]: remoteFiles },
          syncCursors: { [workspaceId]: revision },
          remoteTrees: { [workspaceId]: [...folderRows, ...noteRows] },
          localDirectories: { [workspaceId]: localDirectories }
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
    'keeps unchanged notes synced across a 3,706-note full scan',
    async () => {
      const startedAt = performance.now()
      const result = await scanPkmsSyncBridge(workspaceId)
      const elapsedMs = performance.now() - startedAt

      expect(result.state).toBe('synced')
      expect(result.pendingFiles).toBe(0)
      expect(result.itemStates['folder-000/note-00000.md']).toBe('synced')
      expect(result.itemStates[`folder-${String(Math.floor((noteCount - 1) / 38)).padStart(3, '0')}/note-${String(noteCount - 1).padStart(5, '0')}.md`]).toBe('synced')
      expect(
        testRuntime.request.mock.calls.some(
          ([url, options]) => url.endsWith('/operations') && options.method === 'POST'
        )
      ).toBe(false)
      expect(await readFile(path.join(root, 'folder-000', 'note-00000.md'), 'utf8')).toBe(content)
      console.info(`3,706-note unchanged reconciliation: ${elapsedMs.toFixed(1)} ms`)
    },
    60_000
  )
})
