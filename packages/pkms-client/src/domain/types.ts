export interface User {
  login: string;
  avatarUrl?: string;
}

export interface Repository {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  canWrite: boolean;
}

export interface Workspace {
  id: string;
  repository: string;
  branch: string;
  revision: number;
  githubStatus: string;
  message?: string;
}

export interface FileRecord {
  id: string;
  path: string;
  kind: "markdown" | "asset" | "folder";
  content?: string;
  size?: number;
  revision?: number;
}

export interface SyncStatus {
  githubStatus: string;
  pendingFiles: number;
  message?: string;
  lastGitHubCommitAt?: string;
  nextGitHubFlushAt?: number;
}

export interface RealtimeMessage {
  type: string;
  fileId?: string;
  update?: string;
  operationId?: string;
  acceptedRevision?: number;
  conflictCopyPath?: string;
  revision?: number;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export interface Peer {
  clientId: string;
  login: string;
  avatarUrl?: string;
  fileId?: string;
}

export interface FileLocation {
  workspaceId: string;
  path: string;
}

export type FileNavigation = "push" | "replace" | "none";

export interface TreeRow {
  file: FileRecord;
  depth: number;
}

export interface TreeContextMenu {
  file: FileRecord;
  x: number;
  y: number;
}
