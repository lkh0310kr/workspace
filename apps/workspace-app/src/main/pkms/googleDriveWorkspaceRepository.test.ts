import { describe, expect, it, vi } from 'vitest'
import {
  GoogleDriveWorkspaceRepository,
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
