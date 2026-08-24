import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  pty: {
    spawn: (cols: number, rows: number, cwd?: string): Promise<number> =>
      ipcRenderer.invoke('pty:spawn', cols, rows, cwd),
    write: (id: number, data: Uint8Array): void => ipcRenderer.send('pty:write', id, data),
    resize: (id: number, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    dispose: (id: number): void => ipcRenderer.send('pty:dispose', id),
    onData: (cb: (id: number, data: Uint8Array) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { id: number; data: Uint8Array }): void =>
        cb(payload.id, payload.data)
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
