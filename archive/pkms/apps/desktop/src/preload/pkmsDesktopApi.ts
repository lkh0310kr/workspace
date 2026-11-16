import { ipcRenderer } from 'electron'

export const pkmsDesktop = {
  googleDriveOAuthStatus: () =>
    ipcRenderer.invoke('pkms-google-drive:oauth:status') as Promise<{
      credentialStored: boolean
      clientConfigured: boolean
    }>,
  connectGoogleDrive: () =>
    ipcRenderer.invoke('pkms-google-drive:oauth:connect') as Promise<{
      credentialStored: boolean
      clientConfigured: boolean
    }>,
  disconnectGoogleDrive: () => ipcRenderer.invoke('pkms-google-drive:oauth:disconnect'),
  listGoogleDriveWorkspaces: () =>
    ipcRenderer.invoke('pkms-google-drive:workspace:roots') as Promise<
      import('@pkms/google-drive').DriveFile[]
    >,
  createGoogleDriveWorkspace: () =>
    ipcRenderer.invoke('pkms-google-drive:workspace:create-root') as Promise<{
      root: import('@pkms/google-drive').DriveFile
      entries: import('@pkms/google-drive').GoogleDriveWorkspaceEntry[]
    }>,
  connectGoogleDriveWorkspace: (rootId: string) =>
    ipcRenderer.invoke('pkms-google-drive:workspace:connect', rootId) as Promise<{
      root: import('@pkms/google-drive').DriveFile
      entries: import('@pkms/google-drive').GoogleDriveWorkspaceEntry[]
    }>,
  listGoogleDriveDirectory: (rootId: string, parentItemId: string | null) =>
    ipcRenderer.invoke('pkms-google-drive:workspace:directory', rootId, parentItemId) as Promise<
      import('@pkms/google-drive').GoogleDriveWorkspaceEntry[]
    >,
  searchGoogleDriveWorkspace: (rootId: string, query: string, pageToken?: string) =>
    ipcRenderer.invoke('pkms-google-drive:workspace:search', rootId, query, pageToken) as Promise<
      import('@pkms/google-drive').GoogleDriveWorkspaceSearchPage
    >,
  openGoogleDriveMarkdown: (
    rootId: string,
    fileId: string,
    knownEntry?: import('@pkms/google-drive').GoogleDriveWorkspaceEntry
  ) =>
    ipcRenderer.invoke(
      'pkms-google-drive:workspace:open-markdown',
      rootId,
      fileId,
      knownEntry
    ) as Promise<{
      entry: import('@pkms/google-drive').GoogleDriveWorkspaceEntry
      text: string
      revision: string
    }>,
  readGoogleDriveAsset: (rootId: string, fileId: string) =>
    ipcRenderer.invoke('pkms-google-drive:workspace:read-asset', rootId, fileId) as Promise<{
      entry: import('@pkms/google-drive').GoogleDriveWorkspaceEntry
      bytes: Uint8Array
      contentType: string
    }>,
  saveGoogleDriveMarkdown: (rootId: string, fileId: string, text: string, flushSync?: boolean) =>
    ipcRenderer.invoke(
      'pkms-google-drive:workspace:save-markdown',
      rootId,
      fileId,
      text,
      flushSync
    ) as Promise<{
      revision: string
      sync: import('@pkms/google-drive').DriveSyncResult
    }>,
  syncGoogleDriveWorkspace: (rootId: string) =>
    ipcRenderer.invoke('pkms-google-drive:workspace:sync', rootId) as Promise<
      import('@pkms/google-drive').DriveSyncResult
    >,
  createGoogleDriveItem: (
    rootId: string,
    parentPath: string,
    kind: 'markdown' | 'folder',
    name: string,
    itemId?: string,
    parentItemId?: string
  ) =>
    ipcRenderer.invoke(
      'pkms-google-drive:workspace:create',
      rootId,
      parentPath,
      kind,
      name,
      itemId,
      parentItemId
    ) as Promise<import('@pkms/google-drive').GoogleDriveWorkspaceEntry>,
  renameGoogleDriveItem: (
    rootId: string,
    fileId: string,
    name: string,
    currentEntry?: import('@pkms/google-drive').GoogleDriveWorkspaceEntry
  ) =>
    ipcRenderer.invoke(
      'pkms-google-drive:workspace:rename',
      rootId,
      fileId,
      name,
      currentEntry
    ) as Promise<import('@pkms/google-drive').GoogleDriveWorkspaceEntry>,
  trashGoogleDriveItem: (rootId: string, fileId: string) =>
    ipcRenderer.invoke('pkms-google-drive:workspace:trash', rootId, fileId) as Promise<void>,
  moveGoogleDriveItems: (rootId: string, fileIds: string[], targetPath: string) =>
    ipcRenderer.invoke(
      'pkms-google-drive:workspace:move',
      rootId,
      fileIds,
      targetPath
    ) as Promise<void>,
  disconnectGoogleDriveWorkspace: (rootId: string) =>
    ipcRenderer.invoke('pkms-google-drive:workspace:disconnect', rootId) as Promise<void>,
  openVerification: (url: string): Promise<void> =>
    ipcRenderer.invoke('pkms:open-verification', url),
  request: <T = unknown>(
    path: string,
    options: import('../shared/pkmsClient').PkmsRequestOptions
  ) =>
    ipcRenderer.invoke('pkms:request', path, options) as Promise<
      import('../shared/pkmsClient').PkmsResponse<T>
    >,
  fetchAsset: (path: string) =>
    ipcRenderer.invoke('pkms:fetch-asset', path) as Promise<
      import('../shared/pkmsClient').PkmsAssetResponse
    >,
  syncBridgeStatus: (workspaceId: string) =>
    ipcRenderer.invoke('pkms:sync-bridge:status', workspaceId),
  syncBridgeTree: (workspaceId: string, knownRevision?: number) =>
    ipcRenderer.invoke('pkms:sync-bridge:tree', workspaceId, knownRevision),
  onLocalTreeChanged: (
    listener: (change: { workspaceId: string; path: string | null }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      change: { workspaceId: string; path: string | null }
    ): void => listener(change)
    ipcRenderer.on('pkms:local-tree:changed', handler)
    return () => ipcRenderer.removeListener('pkms:local-tree:changed', handler)
  },
  connectSyncBridge: (workspaceId: string) =>
    ipcRenderer.invoke('pkms:sync-bridge:connect', workspaceId),
  disconnectSyncBridge: (workspaceId: string) =>
    ipcRenderer.invoke('pkms:sync-bridge:disconnect', workspaceId),
  scanSyncBridge: (workspaceId: string) => ipcRenderer.invoke('pkms:sync-bridge:scan', workspaceId),
  updateSyncBridgeExclusions: (workspaceId: string, paths: string[]) =>
    ipcRenderer.invoke('pkms:sync-bridge:exclusions', workspaceId, paths),
  readLocalMarkdown: (workspaceId: string, relativePath: string) =>
    ipcRenderer.invoke('pkms:local-file:read', workspaceId, relativePath),
  writeLocalMarkdown: (workspaceId: string, relativePath: string, text: string, revision: string) =>
    ipcRenderer.invoke('pkms:local-file:write', workspaceId, relativePath, text, revision),
  listLocalDirectory: (workspaceId: string, relativePath: string) =>
    ipcRenderer.invoke('pkms:local-file:list', workspaceId, relativePath),
  getLocalFile: (workspaceId: string, id: string) =>
    ipcRenderer.invoke('pkms:local-file:get', workspaceId, id),
  revealLocalItem: (workspaceId: string, relativePath: string) =>
    ipcRenderer.invoke('pkms:local-item:reveal', workspaceId, relativePath),
  createLocalItem: (
    workspaceId: string,
    parent: string,
    kind: 'markdown' | 'folder',
    name: string
  ) => ipcRenderer.invoke('pkms:local-item:create', workspaceId, parent, kind, name),
  renameLocalItem: (workspaceId: string, id: string, name: string) =>
    ipcRenderer.invoke('pkms:local-item:rename', workspaceId, id, name),
  moveLocalItems: (workspaceId: string, ids: string[], parent: string, overwritePaths?: string[]) =>
    ipcRenderer.invoke('pkms:local-item:move', workspaceId, ids, parent, overwritePaths),
  deleteLocalItems: (workspaceId: string, ids: string[]) =>
    ipcRenderer.invoke('pkms:local-item:delete', workspaceId, ids),
  openServiceOAuth: (url: string): Promise<void> =>
    ipcRenderer.invoke('pkms:open-service-oauth', url)
}
