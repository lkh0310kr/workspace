import type { DriveLogicalOperation } from './operationLog'
import type { GoogleDriveWorkspaceRepository } from './workspaceRepository'

export interface GoogleDriveOperationApplierHooks {
  /** Must durably merge the Yjs update before resolving; retries must be idempotent. */
  applyDocumentUpdate(
    fileId: string,
    update: Uint8Array,
    operation: DriveLogicalOperation
  ): Promise<void>
  /** Must preserve concurrent asset versions and make retries idempotent. */
  applyAssetReplacement(
    fileId: string,
    mimeType: string,
    bytes: Uint8Array,
    operation: DriveLogicalOperation
  ): Promise<void>
}

/** Applies durable Drive operations in a stable order before the replica checkpoints them. */
export class GoogleDriveOperationApplier {
  constructor(
    private readonly repository: GoogleDriveWorkspaceRepository,
    private readonly hooks: GoogleDriveOperationApplierHooks
  ) {}

  async apply(operations: readonly DriveLogicalOperation[]): Promise<void> {
    const ordered = [...operations].sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.deviceId.localeCompare(right.deviceId) ||
        left.operationId.localeCompare(right.operationId)
    )

    for (const operation of ordered) {
      if (operation.workspaceRootId !== this.repository.rootId)
        throw new Error('The operation belongs to a different Google Drive workspace.')
      const mutation = operation.mutation
      switch (mutation.type) {
        case 'create-folder':
          await this.repository.createFolderOnce(
            operation.operationId,
            mutation.path,
            mutation.itemId ?? operation.operationId
          )
          break
        case 'create-file':
          await this.repository.createFileOnce(
            operation.operationId,
            mutation.path,
            mutation.mimeType,
            mutation.bytes,
            mutation.itemId ?? operation.operationId
          )
          break
        case 'document-update':
          await this.hooks.applyDocumentUpdate(mutation.fileId, mutation.update, operation)
          break
        case 'replace-content':
          await this.hooks.applyAssetReplacement(
            mutation.fileId,
            mutation.mimeType,
            mutation.bytes,
            operation
          )
          break
        case 'rename':
          await this.repository.rename(mutation.fileId, mutation.name)
          break
        case 'move':
          await this.repository.move(mutation.fileId, mutation.targetDirectoryPath)
          break
        case 'trash':
          await this.repository.trash(mutation.fileId)
          break
      }
    }
  }
}
