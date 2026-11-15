import * as Y from '../../../../../node_modules/yjs'
import { describe, expect, it, vi } from 'vitest'
import {
  GoogleDriveYjsDocumentStore,
  MemoryDriveOutbox,
  encodeGoogleDriveDocumentSeed,
  googleDriveDocumentSeedOperationId,
  replaceGoogleDriveYText,
  type GoogleDriveYjsDocumentStorage,
  type GoogleDriveWorkspaceRepository,
  type DriveLogicalOperation
} from '../../../../../packages/pkms-google-drive/src'

function createMemoryStorage(onFlush?: () => void): GoogleDriveYjsDocumentStorage {
  const documents = new Map<string, Y.Doc>()
  return {
    async open(key) {
      const doc = documents.get(key) ?? new Y.Doc()
      documents.set(key, doc)
      return {
        doc,
        flush: async () => onFlush?.(),
        close: async () => {}
      }
    }
  }
}

describe('GoogleDriveYjsDocumentStore', () => {
  it('replaces only changed text while preserving UTF-16 surrogate pairs', () => {
    const doc = new Y.Doc()
    const text = doc.getText('content')
    text.insert(0, 'A😀 before middle after 🧭Z')

    replaceGoogleDriveYText(text, 'A😀 before changed after 🧭Z')

    expect(text.toString()).toBe('A😀 before changed after 🧭Z')
    doc.destroy()
  })

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

  it('merges 1,000 local edits into one Drive operation while persisting each edit locally', async () => {
    let localFlushes = 0
    const outbox = new MemoryDriveOutbox()
    const repository = {
      rootId: 'root',
      readFile: vi.fn(async () => ({
        metadata: { id: 'note', name: 'note.md', mimeType: 'text/markdown' },
        bytes: new TextEncoder().encode('')
      })),
      listTree: vi.fn(),
      writeFile: vi.fn(async () => {})
    } as unknown as GoogleDriveWorkspaceRepository
    const store = new GoogleDriveYjsDocumentStore(
      'root',
      repository,
      { listDocumentOperations: vi.fn(async () => []) },
      outbox,
      createMemoryStorage(() => localFlushes++)
    )
    const opened = await store.open('note')

    for (let index = 0; index < 1_000; index++)
      opened.text.insert(opened.text.length, String(index % 10))
    await store.flushLocalDocument('note')

    const updates = (await outbox.list('root')).filter(
      (operation) =>
        operation.mutation.type === 'document-update' && operation.mutation.fileId === 'note'
    )
    expect(updates).toHaveLength(1)
    if (updates[0]?.mutation.type !== 'document-update') throw new Error('Expected Yjs update')
    const replica = new Y.Doc()
    Y.applyUpdate(replica, encodeGoogleDriveDocumentSeed('note', ''))
    Y.applyUpdate(replica, updates[0].mutation.update)
    expect(replica.getText('content').toString()).toBe(opened.text.toString())
    expect(opened.text.length).toBe(1_000)
    expect(localFlushes).toBeGreaterThanOrEqual(1_000)
    replica.destroy()
    await store.close()
  })
})
