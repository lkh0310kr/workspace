import * as Y from '../../../../../node_modules/yjs'
import { describe, expect, it, vi } from 'vitest'
import {
  GoogleDriveYjsDocumentStore,
  MemoryDriveOutbox,
  googleDriveDocumentSeedOperationId,
  type GoogleDriveYjsDocumentStorage,
  type GoogleDriveWorkspaceRepository
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
    const getOperation = vi.fn(async () => null)
    const store = new GoogleDriveYjsDocumentStore(
      'root',
      repository,
      { get: getOperation },
      new MemoryDriveOutbox(),
      createMemoryStorage()
    )

    const opened = await store.open('selected-note')

    expect(opened.text.toString()).toBe('# selected-note')
    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile).toHaveBeenCalledWith('selected-note')
    expect(listTree).not.toHaveBeenCalled()
    expect(getOperation).toHaveBeenCalledWith(googleDriveDocumentSeedOperationId('selected-note'))
    await store.close()
  })
})
