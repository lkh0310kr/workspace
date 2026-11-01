/** TypeScript view of the language-neutral PKMS HTTP and Realtime contracts. */
export interface PkmsUser {
  login: string;
  avatarUrl?: string;
}

export interface PkmsRepository {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  canWrite: boolean;
}

export type PkmsGitHubStatus = "synced" | "pending" | "failed" | "external-change";

export interface PkmsWorkspace {
  id: string;
  repository: string;
  branch: string;
  revision: number;
  githubStatus: PkmsGitHubStatus;
  message?: string;
  lastGitHubCommitAt?: string;
}

export type PkmsFileKind = "markdown" | "asset" | "folder";

export interface PkmsFile {
  id: string;
  path: string;
  kind: PkmsFileKind;
  content?: string;
  size?: number;
  revision?: number;
}

export interface PkmsSyncStatus {
  githubStatus: PkmsGitHubStatus;
  pendingFiles: number;
  message?: string;
  lastGitHubCommitAt?: string;
  nextGitHubFlushAt?: number;
}

export interface PkmsPeer {
  clientId: string;
  login: string;
  avatarUrl?: string;
  fileId?: string;
}

export interface PkmsRealtimeMessage {
  type: string;
  fileId?: string;
  update?: string;
  operationId?: string;
  acceptedRevision?: number;
  conflictCopyPath?: string;
  revision?: number;
  message?: string;
  code?: string;
  peers?: PkmsPeer[];
  action?: "join" | "update" | "leave";
  peer?: PkmsPeer;
  clientId?: string;
  [key: string]: unknown;
}
