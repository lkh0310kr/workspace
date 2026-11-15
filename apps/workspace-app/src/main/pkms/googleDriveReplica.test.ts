import { describe, expect, it, vi } from 'vitest'
import {
  MemoryGoogleDriveReplica,
  syncDriveChanges,
  type DriveFile
} from '../../../../../packages/pkms-google-drive/src'

describe('direct Drive replica changes', () => {
  it('applies all metadata and cached content before persisting the next cursor', async () => {
    const store = new MemoryGoogleDriveReplica()
    await store.saveCursor('root', 'cursor-1')
    const original: DriveFile = {
      id: 'note',
      name: 'note.md',
      mimeType: 'text/markdown',
      parents: ['root'],
      md5Checksum: 'old'
    }
    await store.saveEntry({
      workspaceRootId: 'root',
      file: original,
      bytes: new TextEncoder().encode('old bytes'),
      cachedAt: 1
    })
    const order: string[] = []
    const storePort = {
      ...store,
      getCursor: store.getCursor.bind(store),
      getEntry: store.getEntry.bind(store),
      listEntries: store.listEntries.bind(store),
      removeEntry: store.removeEntry.bind(store),
      saveEntry: vi.fn(async (entry) => {
        order.push(`apply:${entry.file.id}`)
        await store.saveEntry(entry)
      }),
      saveCursor: vi.fn(async (rootId, cursor) => {
        order.push(`cursor:${cursor}`)
        await store.saveCursor(rootId, cursor)
      })
    }
    const changed: DriveFile = { ...original, md5Checksum: 'new' }
    const client = {
      listChangesPage: vi.fn(async () => ({
        changes: [{ fileId: 'note', file: changed }],
        newStartPageToken: 'cursor-2'
      })),
      getFile: vi.fn(),
      download: vi.fn(async () => new TextEncoder().encode('new bytes'))
    }

    await expect(
      syncDriveChanges({
        client,
        store: storePort,
        workspaceRootId: 'root',
        hasPendingMutation: async () => false
      })
    ).resolves.toMatchObject({ cursor: 'cursor-2', changesApplied: 1, pages: 1 })
    expect(order).toEqual(['apply:note', 'cursor:cursor-2'])
    await expect(store.getEntry('root', 'note')).resolves.toMatchObject({
      file: { md5Checksum: 'new' },
      bytes: new TextEncoder().encode('new bytes')
    })
  })

  it('does not advance the cursor if downloading a cached changed file fails', async () => {
    const store = new MemoryGoogleDriveReplica()
    await store.saveCursor('root', 'cursor-1')
    await store.saveEntry({
      workspaceRootId: 'root',
      file: { id: 'note', name: 'note.md', mimeType: 'text/markdown' },
      bytes: new TextEncoder().encode('local cached bytes'),
      cachedAt: 1
    })
    const client = {
      listChangesPage: vi.fn(async () => ({
        changes: [
          { fileId: 'note', file: { id: 'note', name: 'note.md', mimeType: 'text/markdown' } }
        ],
        newStartPageToken: 'cursor-2'
      })),
      getFile: vi.fn(),
      download: vi.fn(async () => {
        throw new Error('Drive offline')
      })
    }

    await expect(
      syncDriveChanges({
        client,
        store,
        workspaceRootId: 'root',
        hasPendingMutation: async () => false
      })
    ).rejects.toThrow('Drive offline')
    await expect(store.getCursor('root')).resolves.toBe('cursor-1')
    await expect(store.getEntry('root', 'note')).resolves.toMatchObject({
      bytes: new TextEncoder().encode('local cached bytes')
    })
  })

  it('retains a cached item when Drive reports removal while a local mutation is pending', async () => {
    const store = new MemoryGoogleDriveReplica()
    await store.saveCursor('root', 'cursor-1')
    await store.saveEntry({
      workspaceRootId: 'root',
      file: { id: 'note', name: 'note.md', mimeType: 'text/markdown' },
      bytes: new TextEncoder().encode('pending content'),
      cachedAt: 1
    })
    const client = {
      listChangesPage: vi.fn(async () => ({
        changes: [{ fileId: 'note', removed: true }],
        newStartPageToken: 'cursor-2'
      })),
      getFile: vi.fn(),
      download: vi.fn()
    }

    await syncDriveChanges({
      client,
      store,
      workspaceRootId: 'root',
      hasPendingMutation: async () => true
    })

    await expect(store.getEntry('root', 'note')).resolves.toMatchObject({ remoteDeleted: true })
    await expect(store.getCursor('root')).resolves.toBe('cursor-2')
  })

  it('removes a deleted folder subtree but retains pending descendant edits as recovery items', async () => {
    const store = new MemoryGoogleDriveReplica()
    await store.saveCursor('root', 'cursor-1')
    await store.saveEntry({
      workspaceRootId: 'root',
      file: {
        id: 'folder',
        name: 'folder',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['root']
      },
      cachedAt: 1
    })
    await store.saveEntry({
      workspaceRootId: 'root',
      file: { id: 'note', name: 'note.md', mimeType: 'text/markdown', parents: ['folder'] },
      bytes: new TextEncoder().encode('unmerged edit'),
      cachedAt: 1
    })
    const client = {
      listChangesPage: vi.fn(async () => ({
        changes: [{ fileId: 'folder', removed: true }],
        newStartPageToken: 'cursor-2'
      })),
      getFile: vi.fn(),
      download: vi.fn()
    }

    await syncDriveChanges({
      client,
      store,
      workspaceRootId: 'root',
      hasPendingMutation: async (fileId) => fileId === 'note'
    })

    await expect(store.getEntry('root', 'folder')).resolves.toBeNull()
    await expect(store.getEntry('root', 'note')).resolves.toMatchObject({
      remoteDeleted: true,
      bytes: new TextEncoder().encode('unmerged edit')
    })
  })
})
