import type { DriveLogicalOperation, GoogleDriveOperationLog } from './operationLog'
import type { DriveOutbox } from './outbox'
import { GoogleDriveOperationApplier } from './operationApplier'
import { GoogleDriveSyncEngine } from './syncEngine'
import type { GoogleDriveYjsDocumentStore } from './yjsDocuments'
import type { GoogleDriveWorkspaceRepository } from './workspaceRepository'

export interface GoogleDriveWorkspaceSyncOptions {
  repository: GoogleDriveWorkspaceRepository
  operationLog: Pick<GoogleDriveOperationLog, 'append' | 'initializeCursor' | 'listChanges'>
  outbox: DriveOutbox
  documents: Pick<
    GoogleDriveYjsDocumentStore,
    'applyDocumentSeed' | 'applyDocumentUpdate' | 'projectDocument'
  >
  applyAssetReplacement(
    fileId: string,
    mimeType: string,
    bytes: Uint8Array,
    operation: DriveLogicalOperation
  ): Promise<void>
}

/** Composes the shared, platform-neutral Drive operation replay pipeline. */
export function createGoogleDriveWorkspaceSync(options: GoogleDriveWorkspaceSyncOptions) {
  const applier = new GoogleDriveOperationApplier(options.repository, {
    applyDocumentSeed: (fileId, text) => options.documents.applyDocumentSeed(fileId, text),
    applyDocumentUpdate: (fileId, update) => options.documents.applyDocumentUpdate(fileId, update),
    projectDocument: (fileId) => options.documents.projectDocument(fileId),
    applyAssetReplacement: (fileId, mimeType, bytes, operation) =>
      options.applyAssetReplacement(fileId, mimeType, bytes, operation)
  })
  const engine = new GoogleDriveSyncEngine(
    options.repository.rootId,
    options.outbox,
    options.operationLog,
    (operations) => applier.apply(operations)
  )
  return { engine, applier }
}
