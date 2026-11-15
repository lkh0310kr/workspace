import type { DriveLogicalOperation } from './operationLog'
import {
  GoogleDriveWorkspaceItemNotFoundError,
  type GoogleDriveWorkspaceRepository
} from './workspaceRepository'

export interface GoogleDriveOperationApplierHooks {
  /** Applies the common initial document state before any document updates. */
  applyDocumentSeed(fileId: string, text: string, operation: DriveLogicalOperation): Promise<void>
  /** Must durably merge the Yjs update before resolving; retries must be idempotent. */
  applyDocumentUpdate(
    fileId: string,
    update: Uint8Array,
    operation: DriveLogicalOperation
  ): Promise<void>
  /** Materializes the merged document text into its ordinary Drive Markdown file. */
  projectDocument(fileId: string): Promise<void>
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

    const changedDocuments = new Set<string>()
    for (const operation of ordered) {
      if (operation.workspaceRootId !== this.repository.rootId)
        throw new Error('The operation belongs to a different Google Drive workspace.')
      const mutation = operation.mutation
      const applyToExistingItem = async (fileId: string, apply: () => Promise<void>) => {
        try {
          await this.repository.getEntry(fileId)
          await apply()
          return true
        } catch (cause) {
          // A Drive deletion can leave older edits in the immutable operation log.
          // Skip only a confirmed missing item so it cannot block workspace connect.
          if (cause instanceof GoogleDriveWorkspaceItemNotFoundError) return false
          throw cause
        }
      }
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
          if (
            await applyToExistingItem(mutation.fileId, () =>
              this.hooks.applyDocumentUpdate(mutation.fileId, mutation.update, operation)
            )
          )
            changedDocuments.add(mutation.fileId)
          break
        case 'document-seed':
          if (
            await applyToExistingItem(mutation.fileId, () =>
              this.hooks.applyDocumentSeed(mutation.fileId, mutation.text, operation)
            )
          )
            changedDocuments.add(mutation.fileId)
          break
        case 'replace-content':
          await applyToExistingItem(mutation.fileId, () =>
            this.hooks.applyAssetReplacement(
              mutation.fileId,
              mutation.mimeType,
              mutation.bytes,
              operation
            )
          )
          break
        case 'rename':
          await applyToExistingItem(mutation.fileId, async () => {
            await this.repository.rename(mutation.fileId, mutation.name)
          })
          break
        case 'move':
          await applyToExistingItem(mutation.fileId, async () => {
            await this.repository.move(mutation.fileId, mutation.targetDirectoryPath)
          })
          break
        case 'trash':
          await this.repository.trashIfPresent(mutation.fileId)
          break
      }
    }
    for (const fileId of changedDocuments) await this.hooks.projectDocument(fileId)
  }
}
