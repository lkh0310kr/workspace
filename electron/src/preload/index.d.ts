import { ElectronAPI } from '@electron-toolkit/preload'

export interface WorkspaceApi {
  pty: {
    spawn: (cols: number, rows: number, cwd?: string) => Promise<number>
    write: (id: number, data: Uint8Array) => void
    resize: (id: number, cols: number, rows: number) => void
    dispose: (id: number) => void
    onData: (cb: (id: number, data: Uint8Array) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WorkspaceApi
  }
}
