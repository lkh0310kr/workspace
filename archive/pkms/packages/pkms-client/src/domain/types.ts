import type {
  PkmsFile,
  PkmsPeer,
  PkmsRealtimeMessage,
  PkmsRepository,
  PkmsSyncStatus,
  PkmsUser,
  PkmsWorkspace
} from '@pkms/protocol/types'

export type { PkmsFileKind, PkmsGitHubStatus } from '@pkms/protocol/types'
export type User = PkmsUser
export type Repository = PkmsRepository
export type Workspace = PkmsWorkspace
export type FileRecord = PkmsFile
export type SyncStatus = PkmsSyncStatus
export type RealtimeMessage = PkmsRealtimeMessage
export type Peer = PkmsPeer

export interface FileLocation {
  workspaceId: string
  path: string
}

export type FileNavigation = 'push' | 'replace' | 'none'

export interface TreeRow {
  file: FileRecord
  depth: number
}

export interface TreeContextMenu {
  file: FileRecord
  x: number
  y: number
}
