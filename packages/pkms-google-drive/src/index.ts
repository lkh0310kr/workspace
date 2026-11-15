export { GoogleDriveAssetConflictMaterializer } from './assetConflictMaterializer'
export {
  DriveApiError,
  DriveAuthenticationRequiredError,
  GoogleDriveClient,
  applyDriveChanges
} from './googleDriveClient'
export {
  GoogleDriveWorkspaceItemNotFoundError,
  GoogleDriveWorkspaceRepository,
  listGoogleDriveWorkspaceRoots,
  resolveGoogleDriveWorkspaceRoot,
  type GoogleDriveWorkspaceEntry,
  type GoogleDriveWorkspaceSearchPage
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
  replaceGoogleDriveYText,
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
export { parseGoogleAccountAllowlist, requireAllowedGoogleAccount } from './googleAccountAllowlist'
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
  DriveFilePage,
  DriveListOptions,
  DriveRequestOptions,
  DriveRetryOptions
} from './googleDriveClient'
