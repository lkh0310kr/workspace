import { describe, expect, it, vi } from 'vitest'
import {
  createGoogleDriveWorkspaceSync,
  GoogleDriveWorkspaceItemNotFoundError,
  MemoryDriveOutbox,
  type DriveLogicalOperation,
  type GoogleDriveOperationLog,
  type GoogleDriveWorkspaceRepository,
  type GoogleDriveYjsDocumentStore
} from '../../../../../packages/pkms-google-drive/src'

describe('createGoogleDriveWorkspaceSync', () => {
  it('composes local outbox replay with document merge and projection', async () => {
    const repository = {
      rootId: 'root',
      getEntry: vi.fn(async (id: string) => ({ id })),
      createFolderOnce: vi.fn(),
      createFileOnce: vi.fn(),
      rename: vi.fn(),
      move: vi.fn(),
      trash: vi.fn()
    } as unknown as GoogleDriveWorkspaceRepository
    const operation: DriveLogicalOperation = {
      version: 1,
      workspaceRootId: 'root',
      operationId: 'seed-note',
      deviceId: 'device',
      sequence: 1,
      createdAt: 1,
      mutation: { type: 'document-seed', fileId: 'note', text: '# Note' }
    }
    const operations: DriveLogicalOperation[] = []
    const operationLog = {
      append: vi.fn(async (next: DriveLogicalOperation) => {
        operations.push(next)
      }),
      initializeCursor: vi.fn(async () => 'cursor-initial'),
      listChanges: vi.fn(async (_cursor: string, applied: ReadonlySet<string>) => ({
        operations: operations.filter((item) => !applied.has(item.operationId)),
        cursor: 'cursor-next'
      }))
    } as unknown as GoogleDriveOperationLog
    const documents = {
      applyDocumentSeed: vi.fn(async () => {}),
      applyDocumentUpdate: vi.fn(async () => {}),
      projectDocument: vi.fn(async () => {})
    } as unknown as GoogleDriveYjsDocumentStore
    const applyAssetReplacement = vi.fn(async () => {})
    const { engine } = createGoogleDriveWorkspaceSync({
      repository,
      operationLog,
      outbox: new MemoryDriveOutbox(),
      documents,
      applyAssetReplacement
    })
    await engine.enqueue(operation.mutation)

    await expect(engine.sync()).resolves.toMatchObject({
      uploadedOperations: 1,
      appliedOperations: 1,
      pendingOperations: 0
    })
    expect(documents.applyDocumentSeed).toHaveBeenCalledWith('note', '# Note')
    expect(documents.projectDocument).toHaveBeenCalledWith('note')
    expect(repository.createFileOnce).not.toHaveBeenCalled()
  })

  it('connect sync advances past historical operations for items removed from Drive', async () => {
    const missingItem = new GoogleDriveWorkspaceItemNotFoundError('removed-item')
    const repository = {
      rootId: 'root',
      getEntry: vi.fn(async () => {
        throw missingItem
      })
    } as unknown as GoogleDriveWorkspaceRepository
    const removedItemUpdate: DriveLogicalOperation = {
      version: 1,
      workspaceRootId: 'root',
      operationId: 'stale-update',
      deviceId: 'old-device',
      sequence: 42,
      createdAt: 42,
      mutation: {
        type: 'document-update',
        fileId: 'removed-item',
        update: new Uint8Array([1])
      }
    }
    const operationLog = {
      append: vi.fn(),
      initializeCursor: vi.fn(async () => 'cursor-before-stale-update'),
      listChanges: vi.fn(async () => ({
        operations: [removedItemUpdate],
        cursor: 'cursor-after-stale-update'
      }))
    } as unknown as GoogleDriveOperationLog
    const outbox = new MemoryDriveOutbox()
    const documents = {
      applyDocumentSeed: vi.fn(),
      applyDocumentUpdate: vi.fn(),
      projectDocument: vi.fn()
    } as unknown as GoogleDriveYjsDocumentStore
    const { engine } = createGoogleDriveWorkspaceSync({
      repository,
      operationLog,
      outbox,
      documents,
      applyAssetReplacement: vi.fn()
    })

    await expect(engine.sync()).resolves.toMatchObject({ appliedOperations: 1 })
    await expect(outbox.getRemoteCursor('root')).resolves.toBe('cursor-after-stale-update')
    expect(documents.applyDocumentUpdate).not.toHaveBeenCalled()
  })
})
