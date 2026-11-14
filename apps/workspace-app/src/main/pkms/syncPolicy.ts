export type SyncBaselineIdentity = { fileId: string; revision: number }
export type SyncTreeEntry = { id: string; path: string; kind: string }

type RootScopedState = {
  baselines: Record<string, unknown>
  remoteFiles: Record<string, unknown>
  syncCursors: Record<string, unknown>
  remoteTrees: Record<string, unknown>
  remoteTreeVersions: Record<string, unknown>
  pendingFullScans: Record<string, unknown>
  pendingPaths: Record<string, unknown>
  pendingFolderCreates: Record<string, unknown>
  localDirectories: Record<string, unknown>
  pendingDeletes: Record<string, unknown>
  pendingRemoteFolderDeletes: Record<string, unknown>
}

/** Clear facts derived from a local root when that root changes. */
export function resetRootScopedState<T extends RootScopedState>(
  state: T,
  workspaceId: string
): void {
  delete state.baselines[workspaceId]
  delete state.remoteFiles[workspaceId]
  delete state.syncCursors[workspaceId]
  delete state.remoteTrees[workspaceId]
  delete state.remoteTreeVersions[workspaceId]
  delete state.pendingFullScans[workspaceId]
  delete state.pendingPaths[workspaceId]
  delete state.pendingFolderCreates[workspaceId]
  delete state.localDirectories[workspaceId]
  delete state.pendingDeletes[workspaceId]
  delete state.pendingRemoteFolderDeletes[workspaceId]
}

export function remoteChangedSinceBaseline(
  remote: { id: string; revision: number },
  baseline: SyncBaselineIdentity
): boolean {
  return remote.id !== baseline.fileId || remote.revision !== baseline.revision
}

export function nextGuardedFolderDeleteRevision(
  currentPassRevision: number | undefined,
  queuedRevision: number
): number {
  return Math.max(currentPassRevision ?? queuedRevision, queuedRevision)
}

/** Identify folder tombstones when an authoritative snapshot replaces a known manifest. */
export function remoteDeletedFolders(
  previousTree: readonly SyncTreeEntry[],
  currentTree: readonly SyncTreeEntry[]
): string[] {
  const currentIds = new Set(currentTree.map((item) => item.id))
  return previousTree
    .filter((item) => item.kind === 'folder' && !currentIds.has(item.id))
    .map((item) => item.path)
}

export function pathIsWithinFolder(candidate: string, folder: string): boolean {
  return candidate === folder || candidate.startsWith(`${folder}/`)
}

/** Choose local directory paths that need a cloud folder marker, shallowest first. */
export function folderPathsToReconcile(
  localDirectories: Iterable<string>,
  remoteTree: readonly { path: string; kind: string }[],
  scanAllDirectories: boolean,
  changedPaths: Iterable<string>
): string[] {
  const remoteFolderPaths = new Set(
    remoteTree.filter((item) => item.kind === 'folder').map((item) => item.path)
  )
  const candidates = new Set(scanAllDirectories ? localDirectories : changedPaths)
  return [...candidates]
    .filter((path) => path && !remoteFolderPaths.has(path))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
}
