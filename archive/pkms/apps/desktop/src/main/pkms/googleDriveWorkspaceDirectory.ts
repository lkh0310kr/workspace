import {
  GoogleDriveWorkspaceItemNotFoundError,
  type GoogleDriveWorkspaceEntry,
  type GoogleDriveWorkspaceRepository
} from '@pkms/google-drive'
import type { DriveOutbox } from '@pkms/google-drive'

/**
 * A just-enqueued folder has a stable PKMS ID before Drive can resolve it.
 * Opening it during upload is a valid empty branch, not a missing-item error.
 */
export async function listGoogleDriveDirectoryOrPendingFolder(
  repository: Pick<GoogleDriveWorkspaceRepository, 'listDirectoryById'>,
  outbox: Pick<DriveOutbox, 'list'>,
  rootId: string,
  parentItemId: string | null
): Promise<GoogleDriveWorkspaceEntry[]> {
  try {
    return await repository.listDirectoryById(parentItemId)
  } catch (cause) {
    if (!(cause instanceof GoogleDriveWorkspaceItemNotFoundError) || !parentItemId) throw cause
    const pending = await outbox.list(rootId)
    const folderIsPending = pending.some(
      (operation) =>
        operation.workspaceRootId === rootId &&
        operation.mutation.type === 'create-folder' &&
        (operation.mutation.itemId ?? operation.operationId) === parentItemId
    )
    if (!folderIsPending) throw cause
    return []
  }
}
