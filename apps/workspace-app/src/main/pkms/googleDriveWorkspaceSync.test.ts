import { describe, expect, it, vi } from 'vitest'
import {
  createGoogleDriveWorkspaceSync,
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
})
