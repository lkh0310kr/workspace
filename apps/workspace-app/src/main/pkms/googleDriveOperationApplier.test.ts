import { describe, expect, it, vi } from 'vitest'
import {
  DriveApiError,
  GoogleDriveOperationApplier,
  GoogleDriveWorkspaceRepository,
  type DriveLogicalOperation,
  type DriveFile
} from '../../../../../packages/pkms-google-drive/src'

function operation(
  sequence: number,
  operationId: string,
  mutation: DriveLogicalOperation['mutation']
): DriveLogicalOperation {
  return {
    version: 1,
    workspaceRootId: 'root',
    operationId,
    deviceId: 'device-a',
    sequence,
    createdAt: sequence,
    mutation
  }
}

describe('GoogleDriveOperationApplier', () => {
  it('applies tree mutations in deterministic order and delegates content convergence', async () => {
    const events: string[] = []
    const repository = {
      rootId: 'root',
      createFolderOnce: vi.fn(async (opId, path, itemId) => {
        events.push(`folder:${opId}:${path}:${itemId}`)
        return {} as never
      }),
      createFileOnce: vi.fn(async (opId, path, mimeType, bytes, itemId) => {
        events.push(`file:${opId}:${path}:${mimeType}:${bytes.length}:${itemId}`)
        return {} as never
      }),
      rename: vi.fn(async (fileId, name) => {
        events.push(`rename:${fileId}:${name}`)
        return {} as never
      }),
      move: vi.fn(async (fileId, path) => {
        events.push(`move:${fileId}:${path}`)
        return {} as never
      }),
      trashIfPresent: vi.fn(async (fileId) => {
        events.push(`trash:${fileId}`)
      })
    } as unknown as GoogleDriveWorkspaceRepository
    const hooks = {
      applyDocumentSeed: vi.fn(async (fileId, text) => {
        events.push(`seed:${fileId}:${text}`)
      }),
      applyDocumentUpdate: vi.fn(async (fileId, update) => {
        events.push(`document:${fileId}:${update[0]}`)
      }),
      applyAssetReplacement: vi.fn(async (fileId, mimeType, bytes) => {
        events.push(`asset:${fileId}:${mimeType}:${bytes.length}`)
      }),
      projectDocument: vi.fn(async (fileId) => {
        events.push(`project:${fileId}`)
      })
    }
    const applier = new GoogleDriveOperationApplier(repository, hooks)

    await applier.apply([
      operation(4, 'trash', { type: 'trash', fileId: 'item' }),
      operation(2, 'create-file', {
        type: 'create-file',
        path: 'notes/new.md',
        mimeType: 'text/markdown',
        bytes: new Uint8Array([1])
      }),
      operation(1, 'folder', { type: 'create-folder', path: 'notes' }),
      operation(3, 'rename', { type: 'rename', fileId: 'item', name: 'renamed.md' }),
      operation(5, 'doc', { type: 'document-update', fileId: 'item', update: new Uint8Array([2]) }),
      operation(6, 'asset', {
        type: 'replace-content',
        fileId: 'asset',
        mimeType: 'image/png',
        bytes: new Uint8Array([3, 4])
      })
    ])

    expect(events).toEqual([
      'folder:folder:notes:folder',
      'file:create-file:notes/new.md:text/markdown:1:create-file',
      'rename:item:renamed.md',
      'trash:item',
      'document:item:2',
      'asset:asset:image/png:2',
      'project:item'
    ])
    expect(repository.createFolderOnce).toHaveBeenCalledTimes(1)
    expect(hooks.applyDocumentUpdate).toHaveBeenCalledTimes(1)
    expect(hooks.applyAssetReplacement).toHaveBeenCalledTimes(1)
  })

  it('refuses to apply an operation from another workspace', async () => {
    const repository = { rootId: 'root' } as GoogleDriveWorkspaceRepository
    const hooks = {
      applyDocumentSeed: vi.fn(),
      applyDocumentUpdate: vi.fn(),
      applyAssetReplacement: vi.fn(),
      projectDocument: vi.fn()
    }
    const applier = new GoogleDriveOperationApplier(repository, hooks)

    await expect(
      applier.apply([
        {
          ...operation(1, 'foreign', { type: 'trash', fileId: 'item' }),
          workspaceRootId: 'another-root'
        }
      ])
    ).rejects.toThrow(/different Google Drive workspace/)
  })

  it('replays create, rename, and move operations without duplicating or undoing later state', async () => {
    const root: DriveFile = {
      id: 'root',
      name: 'PKMS',
      mimeType: 'application/vnd.google-apps.folder'
    }
    const files = new Map<string, DriveFile>([[root.id, root]])
    let nextDriveId = 0
    const getFile = vi.fn(async (id: string) => {
      const file = files.get(id)
      if (!file) throw new DriveApiError(404, 'notFound', 'missing')
      return file
    })
    const listFiles = vi.fn(async ({ query = '' }: { query?: string }) =>
      [...files.values()].filter((file) => {
        const properties = file.appProperties
        return Boolean(
          properties?.pkmsWorkspaceRootId === root.id &&
          (query.includes(`value='${properties.pkmsCreateOperationId}'`) ||
            query.includes(`value='${properties.pkmsItemId}'`))
        )
      })
    )
    const listChildren = vi.fn(async (parentId: string) =>
      [...files.values()].filter((file) => !file.trashed && file.parents?.includes(parentId))
    )
    const createFolder = vi.fn(
      async (name: string, parentId: string | null, appProperties?: Record<string, string>) => {
        const file: DriveFile = {
          id: `drive-${++nextDriveId}`,
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: parentId ? [parentId] : [],
          appProperties
        }
        files.set(file.id, file)
        return file
      }
    )
    const createFile = vi.fn(
      async (
        name: string,
        parentId: string,
        mimeType: string,
        _bytes: Uint8Array,
        appProperties?: Record<string, string>
      ) => {
        const file: DriveFile = {
          id: `drive-${++nextDriveId}`,
          name,
          mimeType,
          parents: [parentId],
          appProperties
        }
        files.set(file.id, file)
        return file
      }
    )
    const updateFileMetadata = vi.fn(
      async (
        id: string,
        metadata: Record<string, unknown>,
        options: { addParents?: string; removeParents?: string } = {}
      ) => {
        const previous = files.get(id)!
        const parents = (previous.parents ?? []).filter(
          (parent) => parent !== options.removeParents
        )
        if (options.addParents && !parents.includes(options.addParents))
          parents.push(options.addParents)
        const next = { ...previous, ...metadata, parents }
        files.set(id, next)
        return next
      }
    )
    const client = {
      getFile,
      listFiles,
      listChildren,
      createFolder,
      createFile,
      updateFileMetadata,
      trashFile: vi.fn()
    }
    const repository = new GoogleDriveWorkspaceRepository(client as never, root.id)
    const applier = new GoogleDriveOperationApplier(repository, {
      applyDocumentSeed: vi.fn(async () => {}),
      applyDocumentUpdate: vi.fn(async () => {}),
      applyAssetReplacement: vi.fn(async () => {}),
      projectDocument: vi.fn(async () => {})
    })
    const operations = [
      operation(1, 'folder-op', {
        type: 'create-folder',
        path: 'notes',
        itemId: 'folder-item'
      }),
      operation(2, 'create-op', {
        type: 'create-file',
        path: 'notes/new.md',
        itemId: 'note-item',
        mimeType: 'text/markdown',
        bytes: new Uint8Array([1])
      }),
      operation(3, 'rename-op', { type: 'rename', fileId: 'note-item', name: 'renamed.md' }),
      operation(4, 'move-op', { type: 'move', fileId: 'note-item', targetDirectoryPath: '' })
    ]

    await applier.apply(operations)
    await applier.apply(operations)

    await expect(repository.listTree()).resolves.toMatchObject([
      { id: 'folder-item', path: 'notes', kind: 'folder' },
      { id: 'note-item', path: 'renamed.md', kind: 'markdown' }
    ])
    expect(createFolder).toHaveBeenCalledTimes(1)
    expect(createFile).toHaveBeenCalledTimes(1)
    expect(updateFileMetadata).toHaveBeenCalledTimes(2)
  })
})
