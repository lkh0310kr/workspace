import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testRuntime = vi.hoisted(() => ({
  userData: `/tmp/workspace-pkms-folder-move-${process.pid}`,
  request: vi.fn(),
  operations: [] as Array<Record<string, unknown>>
}))

vi.mock('electron', () => ({
  app: { getPath: () => testRuntime.userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: vi.fn() }
}))
vi.mock('./api', () => ({ requestPkmsApi: testRuntime.request, fetchPkmsAsset: vi.fn() }))
vi.mock('../startupLog', () => ({ appendStartupLog: vi.fn(), isPackagedApp: () => false }))

import { scanPkmsSyncBridge, stopPkmsSyncBridges } from './syncBridge'

describe('PKMS local folder move reconciliation', () => {
  const workspaceId = 'folder-move-test'
  const oldFolder = '01 math'
  const nextFolder = 'engineering/01 math'
  const text = '# Math note\n'
  const folder = { id: 'math-folder', path: oldFolder, kind: 'folder', revision: 5 }
  const engineering = { id: 'engineering-folder', path: 'engineering', kind: 'folder', revision: 5 }
  const note = { id: 'math-note', path: `${oldFolder}/note.md`, kind: 'markdown', revision: 5 }
  let root: string
  const stateFile = path.join(testRuntime.userData, 'pkms-sync-bridge.json')
  const textHash = (value: string) => createHash('sha256').update(value).digest('hex')

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pkms-folder-move-root-'))
    await mkdir(path.join(root, 'engineering'), { recursive: true })
    await mkdir(path.join(root, oldFolder))
    await writeFile(path.join(root, oldFolder, 'note.md'), text)
    const previousEngineering = await stat(path.join(root, 'engineering'), { bigint: true })
    const previousMath = await stat(path.join(root, oldFolder), { bigint: true })
    await mkdir(testRuntime.userData, { recursive: true })
    await writeFile(
      stateFile,
      JSON.stringify({
        configs: { [workspaceId]: { folderPath: root, excludedPaths: [] } },
        baselines: {
          [workspaceId]: {
            [`${oldFolder}/note.md`]: {
              fileId: note.id,
              hash: textHash(text),
              revision: 5
            }
          }
        },
        remoteFiles: { [workspaceId]: { [note.id]: note } },
        syncCursors: { [workspaceId]: 5 },
        remoteTrees: { [workspaceId]: [engineering, folder, note] },
        localDirectories: {
          [workspaceId]: {
            engineering: `${previousEngineering.dev}:${previousEngineering.ino}`,
            [oldFolder]: `${previousMath.dev}:${previousMath.ino}`
          }
        }
      })
    )
    // Simulate a filesystem move while retaining the directory inode.
    await mkdir(path.join(root, 'engineering'), { recursive: true })
    await import('node:fs/promises').then(({ rename }) =>
      rename(path.join(root, oldFolder), path.join(root, nextFolder))
    )

    testRuntime.request.mockImplementation(
      async (url: string, options: { method: string; body?: { kind: string; value?: string } }) => {
        if (url.includes('/sync/changes'))
          return {
            status: 200,
            body: { changes: [], hasMore: false, nextRevision: 5, lastRevision: 5, lastFileId: '' }
          }
        if (url.endsWith('/operations') && options.method === 'POST') {
          const payload = JSON.parse(options.body?.value ?? '{}') as {
            operationId: string
            operation: { type: string; fileId: string; toPath?: string }
          }
          testRuntime.operations.push(payload)
          if (payload.operation.type === 'move')
            return { status: 200, body: { acceptedRevision: 6 } }
          return { status: 500, body: { error: 'unexpected_duplicate_create' } }
        }
        if (url.includes('/sync/download'))
          return {
            status: 200,
            body: { documents: [{ ...note, path: `${nextFolder}/note.md`, revision: 6, text }] }
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

  it('moves one folder identity and remaps child files and baselines without creates', async () => {
    const result = await scanPkmsSyncBridge(workspaceId)
    expect(result.state).toBe('synced')
    expect(testRuntime.operations).toHaveLength(1)
    expect(testRuntime.operations[0].operation).toMatchObject({
      type: 'move',
      fileId: folder.id,
      toPath: nextFolder
    })
    expect(await readFile(path.join(root, nextFolder, 'note.md'), 'utf8')).toBe(text)

    const state = JSON.parse(await readFile(stateFile, 'utf8')) as {
      baselines: Record<string, Record<string, { fileId: string; revision: number }>>
      remoteTrees: Record<string, Array<{ id: string; path: string; kind: string }>>
    }
    expect(state.baselines[workspaceId][`${oldFolder}/note.md`]).toBeUndefined()
    expect(state.baselines[workspaceId][`${nextFolder}/note.md`]).toMatchObject({
      fileId: note.id,
      revision: 6
    })
    expect(state.remoteTrees[workspaceId]).toContainEqual(
      expect.objectContaining({ id: folder.id, path: nextFolder, kind: 'folder' })
    )
    expect(state.remoteTrees[workspaceId]).toContainEqual(
      expect.objectContaining({ id: note.id, path: `${nextFolder}/note.md`, kind: 'markdown' })
    )
  })
})
