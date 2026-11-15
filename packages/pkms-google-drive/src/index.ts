export { GoogleDriveAssetConflictMaterializer } from './assetConflictMaterializer'
export {
  DriveApiError,
  DriveAuthenticationRequiredError,
  GoogleDriveClient,
  applyDriveChanges
} from './googleDriveClient'
export {
  GoogleDriveWorkspaceRepository,
  resolveGoogleDriveWorkspaceRoot,
  type GoogleDriveWorkspaceEntry
} from './workspaceRepository'
export {
  IndexedDbDriveOutbox,
  MemoryDriveOutbox,
  enqueueDriveMutation,
  type DriveOutbox,
  type DriveOutboxMutation,
  type DriveOutboxOperation
} from './outbox'
export {
  GoogleDriveSyncEngine,
  type DriveSyncResult,
  type GoogleDriveOperationLogPort
} from './syncEngine'
export {
  GoogleDriveOperationApplier,
  type GoogleDriveOperationApplierHooks
} from './operationApplier'
export {
  createGoogleDriveWorkspaceSync,
  type GoogleDriveWorkspaceSyncOptions
} from './workspaceSync'
export { IndexedDbGoogleDriveYjsDocumentStorage } from './indexedDbYjsStorage'
export {
  GoogleDriveYjsDocumentStore,
  encodeGoogleDriveDocumentSeed,
  googleDriveDocumentSeedOperationId,
  type GoogleDriveYjsDocumentHandle,
  type GoogleDriveYjsDocumentStorage
} from './yjsDocuments'
export {
  IndexedDbGoogleDriveReplica,
  MemoryGoogleDriveReplica,
  syncDriveChanges,
  type CachedDriveEntry,
  type GoogleDriveReplicaStore
} from './replica'
export {
  GoogleDriveWebOAuth,
  type GoogleIdentityAccounts,
  type GoogleIdentityProvider,
  type GoogleIdentityTokenClient,
  type GoogleIdentityTokenResponse
} from './webOAuth'
export {
  GoogleDriveOperationLog,
  decodeDriveLogicalOperation,
  encodeDriveLogicalOperation,
  type DriveLogicalOperation,
  type DriveOperationChangeBatch
} from './operationLog'
export type {
  DriveAccessTokenProvider,
  DriveChange,
  DriveChangePage,
  DriveFile,
  DriveListOptions,
  DriveRequestOptions,
  DriveRetryOptions
} from './googleDriveClient'
