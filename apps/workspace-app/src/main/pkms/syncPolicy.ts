export type SyncBaselineIdentity = { fileId: string; revision: number };

type RootScopedState = {
  baselines: Record<string, unknown>;
  remoteFiles: Record<string, unknown>;
  syncCursors: Record<string, unknown>;
  remoteTrees: Record<string, unknown>;
  remoteTreeVersions: Record<string, unknown>;
  pendingPaths: Record<string, unknown>;
  pendingFolderCreates: Record<string, unknown>;
  localDirectories: Record<string, unknown>;
  pendingDeletes: Record<string, unknown>;
};

/** Clear facts derived from a local root when that root changes. */
export function resetRootScopedState<T extends RootScopedState>(state: T, workspaceId: string): void {
  delete state.baselines[workspaceId];
  delete state.remoteFiles[workspaceId];
  delete state.syncCursors[workspaceId];
  delete state.remoteTrees[workspaceId];
  delete state.remoteTreeVersions[workspaceId];
  delete state.pendingPaths[workspaceId];
  delete state.pendingFolderCreates[workspaceId];
  delete state.localDirectories[workspaceId];
  delete state.pendingDeletes[workspaceId];
}

export function remoteChangedSinceBaseline(
  remote: { id: string; revision: number },
  baseline: SyncBaselineIdentity,
): boolean {
  return remote.id !== baseline.fileId || remote.revision !== baseline.revision;
}

export function nextGuardedFolderDeleteRevision(
  currentPassRevision: number | undefined,
  queuedRevision: number,
): number {
  return Math.max(currentPassRevision ?? queuedRevision, queuedRevision);
}
