interface WorkspaceSwitchSession {
  save(): Promise<{ syncPhase?: string; message?: string }>
  close(): Promise<void>
}

export async function flushDocumentBeforeWorkspaceSync(
  session: WorkspaceSwitchSession | null,
  syncNextWorkspace: () => Promise<unknown>
): Promise<void> {
  if (session) {
    const snapshot = await session.save()
    if (snapshot.syncPhase !== 'synced') {
      throw new Error(
        snapshot.message ?? 'Could not sync the current document before changing workspaces.'
      )
    }
  }

  await syncNextWorkspace()
  await session?.close()
}
