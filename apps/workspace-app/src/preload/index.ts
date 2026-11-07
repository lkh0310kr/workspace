import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { api } from './api'
import { electronAPI } from '@electron-toolkit/preload'

// Resolve dropped File objects in preload: File.path is unavailable in the
// isolated renderer, while Electron's webUtils can safely provide the path.
window.addEventListener(
  'drop',
  (event: DragEvent) => {
    const target = event.composedPath().find(
      (item): item is Element => item instanceof Element && item.matches('.xterm'),
    )
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
        detail: { paths },
      }),
    )
  },
  true,
)

// Custom APIs for renderer
const pkmsDesktop = {
  openVerification: (url: string): Promise<void> => ipcRenderer.invoke('pkms:open-verification', url),
  request: <T = unknown>(path: string, options: import('../shared/pkmsClient').PkmsRequestOptions) =>
    ipcRenderer.invoke('pkms:request', path, options) as Promise<import('../shared/pkmsClient').PkmsResponse<T>>,
  fetchAsset: (path: string) =>
    ipcRenderer.invoke('pkms:fetch-asset', path) as Promise<import('../shared/pkmsClient').PkmsAssetResponse>,
  openServiceOAuth: (url: string): Promise<void> => ipcRenderer.invoke('pkms:open-service-oauth', url),
}
const workspaceHome = {
  request: <T = unknown>(path: string, options: import('../shared/pkmsClient').PkmsRequestOptions) =>
    ipcRenderer.invoke('workspace-home:request', path, options) as Promise<import('../shared/pkmsClient').PkmsResponse<T>>,
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
