import { describe, expect, it, vi } from 'vitest'
import {
  DriveApiError,
  GoogleDriveWorkspaceRepository,
  resolveGoogleDriveWorkspaceRoot,
  type DriveFile,
  type GoogleDriveClient
} from '../../../../../packages/pkms-google-drive/src'

const folder = (id: string, name: string, parents: string[] = []): DriveFile => ({
  id,
  name,
  mimeType: 'application/vnd.google-apps.folder',
  parents
})

describe('GoogleDriveWorkspaceRepository', () => {
  it('rediscovers the same app-owned root on another client and refuses ambiguous roots', async () => {
    const root = folder('shared-root', 'PKMS')
    const client = {
      listFiles: vi.fn(async () => [root]),
      createFolder: vi.fn(),
      getFile: vi.fn()
    } as unknown as GoogleDriveClient

    await expect(resolveGoogleDriveWorkspaceRoot(client)).resolves.toEqual(root)
    expect(client.createFolder).not.toHaveBeenCalled()
    expect(client.listFiles).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining("key='pkmsWorkspace'") })
    )

    vi.mocked(client.listFiles).mockResolvedValue([root, folder('duplicate-root', 'PKMS')])
    await expect(resolveGoogleDriveWorkspaceRoot(client)).rejects.toThrow(/More than one/)
    expect(client.createFolder).not.toHaveBeenCalled()
  })

  it('scopes indexed full-text search pages to Markdown files inside the selected workspace', async () => {
    const directory = folder('notes-folder', 'notes', ['root'])
    const client = {
      searchFullTextPage: vi.fn(async () => ({
        files: [
          { id: 'inside', name: 'note.md', mimeType: 'text/markdown', parents: ['notes-folder'] },
          { id: 'outside', name: 'outside.md', mimeType: 'text/markdown', parents: ['external-folder'] },
          { id: 'asset', name: 'image.png', mimeType: 'image/png', parents: ['root'] }
        ],
        nextPageToken: 'next'
      })),
      getFile: vi.fn(async (id: string) => {
        if (id === 'notes-folder') return directory
        if (id === 'external-folder') return folder('external-folder', 'outside', ['other-root'])
        if (id === 'other-root') return folder('other-root', 'Other')
        throw new Error(`unexpected file lookup: ${id}`)
      })
    } as unknown as GoogleDriveClient
    const repository = new GoogleDriveWorkspaceRepository(client, 'root')

    const page = await repository.searchFullTextPage('guitar', { pageToken: 'cursor', pageSize: 20 })

    expect(page).toEqual({
      entries: [
        expect.objectContaining({
          id: 'inside',
          path: 'notes/note.md',
          kind: 'markdown'
        })
      ],
      nextPageToken: 'next'
    })
    expect(client.searchFullTextPage).toHaveBeenCalledWith('guitar', {
      pageToken: 'cursor',
      pageSize: 20
    })
  })

  it('creates a marked root only when there is no previously created PKMS root', async () => {
    const createFolder = vi.fn(
      async (name: string, _parentId: string | null, appProperties?: Record<string, string>) => ({
        ...folder('new-root', name),
        appProperties
      })
    )
    const client = {
      listFiles: vi.fn(async () => []),
      createFolder,
      getFile: vi.fn()
    } as unknown as GoogleDriveClient

    await expect(resolveGoogleDriveWorkspaceRoot(client)).resolves.toMatchObject({
      id: 'new-root',
      appProperties: { pkmsWorkspace: 'pkms-google-drive-v1' }
    })
    expect(createFolder).toHaveBeenCalledWith('PKMS', null, {
      pkmsWorkspace: 'pkms-google-drive-v1'
    })
  })

  it('recovers a folder create after the Drive request succeeds but its response is lost', async () => {
    const root = folder('root', 'PKMS')
    const operations = new Map<string, DriveFile>()
    let loseAck = true
    const createFolder = vi.fn(
      async (name: string, parentId: string | null, appProperties?: Record<string, string>) => {
        const item = { ...folder('created', name, parentId ? [parentId] : []), appProperties }
        operations.set(appProperties?.pkmsCreateOperationId ?? '', item)
        if (loseAck) {
          loseAck = false
          throw new Error('connection closed after Drive created the folder')
        }
        return item
      }
    )
    const client = {
      getFile: vi.fn(async (id: string) => {
        if (id === 'root') return root
        if (id === 'notes') return folder('notes', 'notes', ['root'])
        throw new DriveApiError(404, 'notFound', 'missing')
      }),
      listFiles: vi.fn(async () => [...operations.values()]),
      createFolder,
      listChildren: vi.fn(async (id: string) =>
        id === 'root' ? [folder('notes', 'notes', ['root'])] : []
      )
    } as unknown as GoogleDriveClient
    const repository = new GoogleDriveWorkspaceRepository(client, 'root')

    await expect(repository.createFolderOnce('stable-op', 'new-folder')).resolves.toMatchObject({
      id: 'stable-op',
      path: 'new-folder',
      kind: 'folder'
    })
    await expect(repository.createFolderOnce('stable-op', 'new-folder')).resolves.toMatchObject({
      id: 'stable-op',
      path: 'new-folder'
    })
    expect(createFolder).toHaveBeenCalledTimes(1)
    expect(client.listFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("key='pkmsCreateOperationId'")
      })
    )
  })

  it('recovers file creation idempotently and rejects reuse of its operation ID with different bytes', async () => {
    const root = folder('root', 'PKMS')
    const operations = new Map<string, DriveFile>()
    let loseAck = true
    const createFile = vi.fn(
      async (
        name: string,
        parentId: string,
        mimeType: string,
        _bytes: Uint8Array,
        appProperties?: Record<string, string>
      ) => {
        const item = { id: 'created-file', name, mimeType, parents: [parentId], appProperties }
        operations.set(appProperties?.pkmsCreateOperationId ?? '', item)
        if (loseAck) {
          loseAck = false
          throw new Error('connection closed after Drive created the file')
        }
        return item
      }
    )
    const client = {
      getFile: vi.fn(async (id: string) => {
        if (id === 'root') return root
        if (id === 'notes') return folder('notes', 'notes', ['root'])
        throw new DriveApiError(404, 'notFound', 'missing')
      }),
      listFiles: vi.fn(async () => [...operations.values()]),
      createFile,
      listChildren: vi.fn(async (id: string) =>
        id === 'root' ? [folder('notes', 'notes', ['root'])] : []
      )
    } as unknown as GoogleDriveClient
    const repository = new GoogleDriveWorkspaceRepository(client, 'root')

    await expect(
      repository.createFileOnce('stable-op', 'notes/new.md', 'text/markdown', new Uint8Array([1]))
    ).resolves.toMatchObject({ id: 'stable-op', path: 'notes/new.md', kind: 'markdown' })
    await expect(
      repository.createFileOnce('stable-op', 'notes/new.md', 'text/markdown', new Uint8Array([1]))
    ).resolves.toMatchObject({ id: 'stable-op' })
    await expect(
      repository.createFileOnce('stable-op', 'notes/new.md', 'text/markdown', new Uint8Array([2]))
    ).rejects.toThrow(/operation ID collision or changed payload/)
    expect(createFile).toHaveBeenCalledTimes(1)
  })

  it('maps app-stable item IDs to Drive IDs and refuses mutation outside the selected root', async () => {
    const root = folder('root', 'PKMS')
    const file: DriveFile = {
      id: 'drive-file-id',
      name: 'note.md',
      mimeType: 'text/markdown',
      parents: ['root'],
      appProperties: { pkmsWorkspaceRootId: 'root', pkmsItemId: 'stable-item-id' }
    }
    const outside: DriveFile = {
      id: 'outside-file',
      name: 'other.md',
      mimeType: 'text/markdown',
      parents: ['other-root'],
      appProperties: { pkmsWorkspaceRootId: 'root', pkmsItemId: 'outside-file' }
    }
    const client = {
      getFile: vi.fn(async (id: string) => {
        if (id === 'root') return root
        if (id === 'drive-file-id') return file
        if (id === 'outside-file') return outside
        throw new DriveApiError(404, 'notFound', 'missing')
      }),
      listFiles: vi.fn(async () => [file]),
      listChildren: vi.fn(async () => [file]),
      updateFileMetadata: vi.fn(async () => file)
    } as unknown as GoogleDriveClient
    const repository = new GoogleDriveWorkspaceRepository(client, 'root')

    await expect(repository.listDirectory('')).resolves.toMatchObject([
      { id: 'stable-item-id', name: 'note.md' }
    ])
    await repository.rename('stable-item-id', 'renamed.md')
    expect(client.updateFileMetadata).toHaveBeenCalledWith('drive-file-id', { name: 'renamed.md' })
    await expect(repository.rename('outside-file', 'renamed.md')).rejects.toThrow(
      /outside this PKMS workspace/
    )
    expect(client.updateFileMetadata).toHaveBeenCalledTimes(1)
  })

  it('lists nested, empty, and dot-prefixed folders while hiding only the root protocol folder', async () => {
    const children: Record<string, DriveFile[]> = {
      root: [
        folder('sub', 'sub', ['root']),
        folder('empty', 'empty', ['root']),
        folder('protocol', '.pkms-sync', ['root']),
        { id: 'note', name: '.note.md', mimeType: 'text/markdown', parents: ['root'] }
      ],
      sub: [folder('nested', '.nested', ['sub'])],
      empty: [],
      nested: [
        { id: 'asset', name: 'data.bin', mimeType: 'application/octet-stream', parents: ['nested'] }
      ]
    }
    const client = {
      getFile: vi.fn(async (id: string) =>
        id === 'root' ? folder('root', 'PKMS') : folder(id, id)
      ),
      listChildren: vi.fn(async (id: string) => children[id] ?? [])
    } as unknown as GoogleDriveClient
    const repository = new GoogleDriveWorkspaceRepository(client, 'root')

    const tree = await repository.listTree({ concurrency: 2 })

    expect(tree.map(({ id, path, kind }) => ({ id, path, kind }))).toEqual([
      { id: 'note', path: '.note.md', kind: 'markdown' },
      { id: 'empty', path: 'empty', kind: 'folder' },
      { id: 'sub', path: 'sub', kind: 'folder' },
      { id: 'nested', path: 'sub/.nested', kind: 'folder' },
      { id: 'asset', path: 'sub/.nested/data.bin', kind: 'asset' }
    ])
    expect(tree.some((entry) => entry.id === 'protocol')).toBe(false)
  })

  it('lists a directory by Drive parent identity and preserves binary file kind', async () => {
    const client = {
      getFile: vi.fn(async (id: string) => folder(id, 'folder')),
      listChildren: vi.fn(async (id: string) =>
        id === 'root'
          ? [folder('folder', 'folder', ['root'])]
          : [{ id: 'image', name: 'photo.png', mimeType: 'image/png', parents: ['folder'] }]
      )
    } as unknown as GoogleDriveClient
    const repository = new GoogleDriveWorkspaceRepository(client, 'root')

    await expect(repository.listDirectory('folder')).resolves.toMatchObject([
      { id: 'image', path: 'folder/photo.png', kind: 'asset' }
    ])
  })

  it('lists one branch by stable ID and resolves individual workspace entries', async () => {
    const root = folder('root', 'PKMS')
    const parent = folder('parent', 'notes', ['root'])
    const note: DriveFile = {
      id: 'note',
      name: 'draft.md',
      mimeType: 'text/markdown',
      parents: ['parent'],
      appProperties: { pkmsItemId: 'stable-note' }
    }
    const client = {
      getFile: vi.fn(async (id: string) => {
        if (id === 'root') return root
        if (id === 'parent') return parent
        if (id === 'note') return note
        throw new DriveApiError(404, 'notFound', 'missing')
      }),
      listFiles: vi.fn(async () => [note]),
      listChildren: vi.fn(async (id: string) => (id === 'parent' ? [note] : []))
    } as unknown as GoogleDriveClient
    const repository = new GoogleDriveWorkspaceRepository(client, 'root')

    await expect(repository.listDirectoryById('parent')).resolves.toMatchObject([
      { id: 'stable-note', path: 'notes/draft.md', kind: 'markdown' }
    ])
    await expect(repository.getEntry('stable-note')).resolves.toMatchObject({
      id: 'stable-note',
      path: 'notes/draft.md',
      kind: 'markdown'
    })
    expect(client.listChildren).toHaveBeenCalledTimes(1)
    expect(client.listChildren).toHaveBeenCalledWith('parent')
  })

  it('rejects stable-ID branch requests outside the selected workspace', async () => {
    const client = {
      getFile: vi.fn(async (id: string) => {
        if (id === 'root') return folder('root', 'PKMS')
        if (id === 'outside') return folder('outside', 'outside', ['other-root'])
        if (id === 'other-root') return folder('other-root', 'Other')
        throw new DriveApiError(404, 'notFound', 'missing')
      }),
      listChildren: vi.fn(async () => [])
    } as unknown as GoogleDriveClient
    const repository = new GoogleDriveWorkspaceRepository(client, 'root')

    await expect(repository.listDirectoryById('outside')).rejects.toThrow(
      /outside this PKMS workspace/
    )
    expect(client.listChildren).not.toHaveBeenCalled()
  })

  it('refuses ambiguous paths and moving a folder into itself', async () => {
    const client = {
      getFile: vi.fn(async (id: string) =>
        id === 'root' ? folder('root', 'PKMS') : folder(id, id, id === 'item' ? ['root'] : [])
      ),
      listChildren: vi.fn(async (id: string) =>
        id === 'root' ? [folder('item', 'item', ['root'])] : []
      ),
      updateFileMetadata: vi.fn()
    } as unknown as GoogleDriveClient
    const repository = new GoogleDriveWorkspaceRepository(client, 'root')

    await expect(repository.move('item', 'item')).rejects.toThrow(
      /itself or one of its descendants/
    )
    await expect(repository.listDirectory('missing')).rejects.toThrow(/Folder does not exist/)
    expect(client.updateFileMetadata).not.toHaveBeenCalled()
  })

  it('rejects moving a folder into its descendant without recursively listing the workspace', async () => {
    const root = folder('root', 'PKMS')
    const parent = folder('parent', 'parent', ['root'])
    const source = folder('source', 'source', ['parent'])
    const child = folder('child', 'child', ['source'])
    const folders: Record<string, DriveFile> = { root, parent, source, child }
    const listChildren = vi.fn(async (id: string) => {
      if (id === 'root') return [parent]
      if (id === 'parent') return [source]
      if (id === 'source') return [child]
      return []
    })
    const client = {
      getFile: vi.fn(async (id: string) => {
        const found = folders[id]
        if (!found) throw new DriveApiError(404, 'notFound', 'missing')
        return found
      }),
      listChildren,
      updateFileMetadata: vi.fn()
    } as unknown as GoogleDriveClient
    const repository = new GoogleDriveWorkspaceRepository(client, 'root')

    await expect(repository.move('source', 'parent/source/child')).rejects.toThrow(
      /itself or one of its descendants/
    )
    expect(listChildren).toHaveBeenCalledTimes(3)
    expect(client.updateFileMetadata).not.toHaveBeenCalled()
  })
})
