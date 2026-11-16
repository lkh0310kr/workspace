import { describe, expect, it, vi } from 'vitest'
import {
  GoogleDriveWorkspaceItemNotFoundError,
  type DriveOutbox,
  type GoogleDriveWorkspaceRepository
} from '@pkms/google-drive'
import { listGoogleDriveDirectoryOrPendingFolder } from './googleDriveWorkspaceDirectory'

const rootId = 'workspace-root'
const folderId = 'new-folder-stable-id'

describe('listGoogleDriveDirectoryOrPendingFolder', () => {
  it('opens an enqueued folder as an empty branch before Drive materializes it', async () => {
    const repository = {
      listDirectoryById: vi.fn(async () => {
        throw new GoogleDriveWorkspaceItemNotFoundError(folderId)
      })
    } as unknown as GoogleDriveWorkspaceRepository
    const outbox = {
      list: vi.fn(async () => [
        {
          workspaceRootId: rootId,
          operationId: 'create-operation',
          sequence: 1,
          deviceId: 'device',
          createdAt: 1,
          mutation: { type: 'create-folder' as const, path: 'New Folder', itemId: folderId }
        }
      ])
    } as unknown as DriveOutbox

    await expect(
      listGoogleDriveDirectoryOrPendingFolder(repository, outbox, rootId, folderId)
    ).resolves.toEqual([])
    expect(outbox.list).toHaveBeenCalledWith(rootId)
  })

  it('preserves missing item errors for IDs without a pending folder create', async () => {
    const missing = new GoogleDriveWorkspaceItemNotFoundError(folderId)
    const repository = {
      listDirectoryById: vi.fn(async () => {
        throw missing
      })
    } as unknown as GoogleDriveWorkspaceRepository
    const outbox = { list: vi.fn(async () => []) } as unknown as DriveOutbox

    await expect(
      listGoogleDriveDirectoryOrPendingFolder(repository, outbox, rootId, folderId)
    ).rejects.toBe(missing)
  })
})
