export type SyncBaselineIdentity = { fileId: string; revision: number };

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
