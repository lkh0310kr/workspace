import { ElectronAPI } from '@electron-toolkit/preload'

export interface TabInfo {
  id: number
  title: string
  layoutJson: string
  rootPath: string
}

export interface WorkspaceState {
  tabs: TabInfo[]
  activeTabId: number
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface WorkspaceApi {
  hostname: () => Promise<string>
  pty: {
    spawn: (cols: number, rows: number) => Promise<number>
    write: (id: number, data: Uint8Array) => void
    resize: (id: number, cols: number, rows: number) => void
    dispose: (id: number) => void
    onData: (cb: (id: number, data: Uint8Array) => void) => () => void
  }
  workspace: {
    getState: () => Promise<WorkspaceState>
    addTab: () => Promise<number>
    closeTab: (tabId: number) => Promise<void>
    selectTab: (tabId: number) => Promise<void>
    setTabLayout: (tabId: number, layoutJson: string) => Promise<void>
    setTabRootPath: (tabId: number, rootPath: string) => Promise<WorkspaceState>
    onUpdated: (cb: (state: WorkspaceState) => void) => () => void
  }
  fs: {
    listDir: (tabId: number, rel: string) => Promise<DirEntry[]>
    readFile: (tabId: number, rel: string) => Promise<string>
    writeFile: (tabId: number, rel: string, content: string) => Promise<void>
    createDir: (tabId: number, rel: string) => Promise<void>
    deletePath: (tabId: number, rel: string) => Promise<void>
    renamePath: (tabId: number, fromRel: string, toRel: string) => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WorkspaceApi
  }
}
