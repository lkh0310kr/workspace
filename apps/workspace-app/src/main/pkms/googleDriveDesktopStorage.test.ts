import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { enqueueDriveMutation } from '@pkms/google-drive'
import { GoogleDriveDesktopStorage } from './googleDriveDesktopStorage'

const temporaryDirectories: string[] = []

function temporaryDatabase(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pkms-google-drive-'))
  temporaryDirectories.push(directory)
  return path.join(directory, 'replica.sqlite')
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true })
})

describe('GoogleDriveDesktopStorage', () => {
  it('persists binary outbox operations, identity, clocks, and cursors across reopen', async () => {
    const databasePath = temporaryDatabase()
    const first = new GoogleDriveDesktopStorage(databasePath)
    const deviceId = await first.getDeviceId()
    const operation = await enqueueDriveMutation(first, 'workspace-root', {
      type: 'create-file',
      path: 'notes/first.md',
      mimeType: 'text/markdown',
      bytes: new Uint8Array([0, 1, 127, 255])
    })
    await first.saveRemoteCursor('workspace-root', 'cursor-1')
    first.closeDatabase()

    const reopened = new GoogleDriveDesktopStorage(databasePath)
    expect(await reopened.getDeviceId()).toBe(deviceId)
    expect(await reopened.allocateSequence('workspace-root')).toBe(2)
    expect(await reopened.getRemoteCursor('workspace-root')).toBe('cursor-1')
    expect(await reopened.list('workspace-root')).toEqual([operation])
    await reopened.markAppliedOperation('workspace-root', operation.operationId)
    expect(
      await reopened.getAppliedOperationIds('workspace-root', [operation.operationId, 'missing'])
    ).toEqual(new Set([operation.operationId]))
    await reopened.acknowledge('workspace-root', operation.operationId)
    expect(await reopened.count('workspace-root')).toBe(0)
    reopened.closeDatabase()
  })

  it('persists Yjs document state across close and process-style reopen', async () => {
    const databasePath = temporaryDatabase()
    const first = new GoogleDriveDesktopStorage(databasePath)
    const handle = await first.open('root:file-1')
    handle.doc.getText('content').insert(0, 'durable note')
    await handle.flush()
    await handle.close()
    handle.doc.destroy()
    first.closeDatabase()

    const reopened = new GoogleDriveDesktopStorage(databasePath)
    const restored = await reopened.open('root:file-1')
    expect(restored.doc.getText('content').toString()).toBe('durable note')
    await restored.close()
    restored.doc.destroy()
    reopened.closeDatabase()
  })
})
