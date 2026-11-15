import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { api } from './api'
import { electronAPI } from '@electron-toolkit/preload'

// Resolve dropped File objects in preload: File.path is unavailable in the
// isolated renderer, while Electron's webUtils can safely provide the path.
window.addEventListener(
  'drop',
  (event: DragEvent) => {
    const target = event
      .composedPath()
      .find((item): item is Element => item instanceof Element && item.matches('.xterm'))
    if (!target || !event.dataTransfer?.files.length) return

    const paths = Array.from(event.dataTransfer.files)
      .map((file) => webUtils.getPathForFile(file))
      .filter((path) => path.length > 0)
    if (!paths.length) return

    event.preventDefault()
    event.stopImmediatePropagation()
    target.dispatchEvent(
      new CustomEvent('workspace-terminal-file-drop', {
        bubbles: true,
        detail: { paths }
      })
    )
  },
  true
)

// Custom APIs for renderer
const pkmsDesktop = {
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
  openGoogleDriveMarkdown: (rootId: string, fileId: string) =>
    ipcRenderer.invoke('pkms-google-drive:workspace:open-markdown', rootId, fileId) as Promise<{
      entry: import('@pkms/google-drive').GoogleDriveWorkspaceEntry
      text: string
      revision: string
    }>,
  saveGoogleDriveMarkdown: (rootId: string, fileId: string, text: string) =>
    ipcRenderer.invoke(
      'pkms-google-drive:workspace:save-markdown',
      rootId,
      fileId,
      text
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
    name: string
  ) =>
    ipcRenderer.invoke(
      'pkms-google-drive:workspace:create',
      rootId,
      parentPath,
      kind,
      name
    ) as Promise<import('@pkms/google-drive').GoogleDriveWorkspaceEntry[]>,
  renameGoogleDriveItem: (rootId: string, fileId: string, name: string) =>
    ipcRenderer.invoke('pkms-google-drive:workspace:rename', rootId, fileId, name) as Promise<
      import('@pkms/google-drive').GoogleDriveWorkspaceEntry
    >,
  trashGoogleDriveItem: (rootId: string, fileId: string) =>
    ipcRenderer.invoke('pkms-google-drive:workspace:trash', rootId, fileId) as Promise<void>,
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
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      change: { workspaceId: string; path: string | null }
    ) => listener(change)
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
const workspaceHome = {
  request: <T = unknown>(
    path: string,
    options: import('../shared/pkmsClient').PkmsRequestOptions
  ) =>
    ipcRenderer.invoke('workspace-home:request', path, options) as Promise<
      import('../shared/pkmsClient').PkmsResponse<T>
    >
}

declare global {
  interface Window {
    workspaceHome: typeof workspaceHome
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('pkmsDesktop', pkmsDesktop)
    contextBridge.exposeInMainWorld('workspaceHome', workspaceHome)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.pkmsDesktop = pkmsDesktop
  window.workspaceHome = workspaceHome
}
