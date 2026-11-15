import * as Y from '../../../../../node_modules/yjs'
import { describe, expect, it, vi } from 'vitest'
import {
  GoogleDriveYjsDocumentStore,
  MemoryDriveOutbox,
  encodeGoogleDriveDocumentSeed,
  googleDriveDocumentSeedOperationId,
  type GoogleDriveYjsDocumentStorage,
  type GoogleDriveWorkspaceRepository,
  type DriveLogicalOperation
} from '../../../../../packages/pkms-google-drive/src'

function createMemoryStorage(): GoogleDriveYjsDocumentStorage {
  const documents = new Map<string, Y.Doc>()
  return {
    async open(key) {
      const doc = documents.get(key) ?? new Y.Doc()
      documents.set(key, doc)
      return { doc, flush: async () => {}, close: async () => {} }
    }
  }
}

describe('GoogleDriveYjsDocumentStore', () => {
  it('loads only the explicitly opened file and never lists the workspace contents', async () => {
    const readFile = vi.fn(async (fileId: string) => ({
      metadata: { id: fileId, name: `${fileId}.md`, mimeType: 'text/markdown' },
      bytes: new TextEncoder().encode(`# ${fileId}`)
    }))
    const listTree = vi.fn()
    const repository = {
      rootId: 'root',
      readFile,
      listTree,
      writeFile: vi.fn(async () => {})
    } as unknown as GoogleDriveWorkspaceRepository
    const listDocumentOperations = vi.fn(async () => [])
    const store = new GoogleDriveYjsDocumentStore(
      'root',
      repository,
      { listDocumentOperations },
      new MemoryDriveOutbox(),
      createMemoryStorage()
    )

    const opened = await store.open('selected-note')

    expect(opened.text.toString()).toBe('# selected-note')
    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile).toHaveBeenCalledWith('selected-note')
    expect(listTree).not.toHaveBeenCalled()
    expect(listDocumentOperations).toHaveBeenCalledWith('selected-note')
    await store.close()
  })

  it('reconstructs only an opened document from its indexed seed and Yjs updates', async () => {
    const seed: DriveLogicalOperation = {
      version: 1,
      workspaceRootId: 'root',
      operationId: googleDriveDocumentSeedOperationId('note'),
      deviceId: 'seed-device',
      sequence: 0,
      createdAt: 0,
      mutation: { type: 'document-seed', fileId: 'note', text: '# Note\n' }
    }
    const remote = new Y.Doc()
    Y.applyUpdate(remote, encodeGoogleDriveDocumentSeed('note', '# Note\n'))
    remote.getText('content').insert(remote.getText('content').length, 'from another device')
    const update: DriveLogicalOperation = {
      version: 1,
      workspaceRootId: 'root',
      operationId: 'update-note',
      deviceId: 'device-b',
      sequence: 1,
      createdAt: 1,
      mutation: {
        type: 'document-update',
        fileId: 'note',
        update: Y.encodeStateAsUpdate(remote)
      }
    }
    remote.destroy()
    const readFile = vi.fn(async () => {
      throw new Error('Opened file should come from its Yjs history')
    })
    const repository = {
      rootId: 'root',
      readFile,
      listTree: vi.fn(),
      writeFile: vi.fn(async () => {})
    } as unknown as GoogleDriveWorkspaceRepository
    const listDocumentOperations = vi.fn(async () => [seed, update])
    const store = new GoogleDriveYjsDocumentStore(
      'root',
      repository,
      { listDocumentOperations },
      new MemoryDriveOutbox(),
      createMemoryStorage()
    )

    const opened = await store.open('note')

    expect(opened.text.toString()).toBe('# Note\nfrom another device')
    expect(listDocumentOperations).toHaveBeenCalledWith('note')
    expect(readFile).not.toHaveBeenCalled()
    await store.close()
  })
})
