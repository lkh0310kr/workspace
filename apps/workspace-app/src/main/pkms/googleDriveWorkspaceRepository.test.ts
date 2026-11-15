import { describe, expect, it, vi } from 'vitest'
import {
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
})
