/** TypeScript view of the language-neutral PKMS HTTP and Realtime contracts. */
export interface PkmsUser {
  login: string
  avatarUrl?: string
}

export interface PkmsSessionResponse {
  user: PkmsUser | null
}

export interface PkmsRepository {
  fullName: string
  defaultBranch: string
  private: boolean
  canWrite: boolean
}

export type PkmsGitHubStatus = 'synced' | 'pending' | 'failed' | 'external-change'

export interface PkmsWorkspace {
  id: string
  repository: string
  branch: string
  revision: number
  githubStatus: PkmsGitHubStatus
  message?: string
  lastGitHubCommitAt?: string
}

export type PkmsFileKind = 'markdown' | 'asset' | 'folder'

export interface PkmsFile {
  id: string
  path: string
  kind: PkmsFileKind
  content?: string
  contentType?: string
  size?: number
  sha256?: string
  revision: number
}

export interface PkmsWorkspaceSnapshot {
  workspaceId: string
  revision: number
  files: PkmsFile[]
  hasMore: boolean
  nextRevision?: number
  afterRevision?: number
}

export interface PkmsSyncStatus {
  serverRevision: number
  githubStatus: PkmsGitHubStatus
  githubHead?: string
  pendingFiles: number
  message?: string
  lastGitHubCommitAt?: string
  nextGitHubFlushAt?: number
}

export type PkmsWorkspaceOperation =
  | { type: 'create-folder'; path: string }
  | { type: 'create-file'; path: string; fileId: string; content?: string }
  | { type: 'move'; fileId: string; toPath: string }
  | { type: 'delete'; fileId: string }

export interface PkmsOperationRequest {
  operationId: string
  baseRevision: number
  clientId: string
  operation: PkmsWorkspaceOperation
}

export interface PkmsOperationResponse {
  operationId: string
  acceptedRevision: number
  duplicate: boolean
  conflictCopyPath?: string
  rebasedFrom?: number
}

export interface PkmsDocumentUpdateRequest {
  operationId: string
  fileId: string
  update: string
}

export interface PkmsDeviceStart {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface PkmsDevicePollResponse {
  pending: boolean
  interval?: number
  token?: string
  user?: PkmsUser
  expiresAt?: number
}

export interface PkmsApiError {
  error?: string
  code?: string
  message?: string
  requestId?: string
  currentRevision?: number
  conflictCopyPath?: string
  maxBytes?: number
  retryAfterSeconds?: number
  requiredScope?: string
}

export interface PkmsPeer {
  clientId: string
  login: string
  avatarUrl?: string
  fileId?: string
}

export type PkmsRealtimeMessageType =
  | 'hello'
  | 'document-update'
  | 'document-state'
  | 'ready'
  | 'presence'
  | 'presence-state'
  | 'ack'
  | 'operation'
  | 'error'

export interface PkmsRealtimeMessage {
  type: PkmsRealtimeMessageType
  protocolVersion?: 1
  afterRevision?: number
  user?: PkmsUser
  fileId?: string
  update?: string
  operationId?: string
  acceptedRevision?: number
  duplicate?: boolean
  rebasedFrom?: number
  conflictCopyPath?: string
  revision?: number
  message?: string
  code?: string
  peers?: PkmsPeer[]
  action?: 'join' | 'update' | 'leave'
  peer?: PkmsPeer
  clientId?: string
  [key: string]: unknown
}
