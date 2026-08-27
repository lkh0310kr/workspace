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

export interface SearchOptions {
  caseSensitive?: boolean
  regex?: boolean
  wholeWord?: boolean
  includeHidden?: boolean
}

export interface SearchMatch {
  lineNumber: number
  lineText: string
  ranges: { start: number; end: number }[]
}

export interface SearchFileResult {
  path: string
  matches: SearchMatch[]
}

export interface FeedItem {
  title: string
  link: string
  pubDate: string | null
  contentSnippet: string | null
}

export interface FeedResult {
  title: string
  items: FeedItem[]
}

export interface EpubSpineItem {
  href: string
  mediaType: string
}

export interface EpubBook {
  bookId: string
  title: string
  spine: EpubSpineItem[]
}

export interface BrowserDownloadEventPayload {
  id: string
  hostWebContentsId: number
  phase: 'started' | 'updated' | 'done'
  filename?: string
  url?: string
  path?: string
  receivedBytes?: number
  totalBytes?: number
  state?: 'progressing' | 'interrupted' | 'completed' | 'cancelled'
}

export interface WorkspaceApi {
  hostname: () => Promise<string>
  shell: {
    revealItemInDir: (path: string) => Promise<void>
  }
  usage: {
    claudeRateLimitStatus: () => Promise<{
      fiveHour: { usedPercent: number; resetsAt: number | null } | null
      sevenDay: { usedPercent: number; resetsAt: number | null } | null
    }>
    cursorUsageStatus: () => Promise<{
      autoPercentUsed: number | null
      apiPercentUsed: number | null
      totalPercentUsed: number | null
      billingCycleEndMs: number | null
    }>
  }
  dialog: {
    openDirectory: (defaultPath?: string) => Promise<string | null>
  }
  clipboard: {
    writeText: (text: string) => void
  }
  debug: {
    interactionLog: (entry: Record<string, unknown>) => void
    terminalLog: (entry: Record<string, unknown>) => void
    layoutLog: (entry: Record<string, unknown>) => void
  }
  browser: {
    onOpenNewTab: (cb: (payload: { hostWebContentsId: number; url: string }) => void) => () => void
    onGuestFocus: (cb: (payload: { webContentsId: number; focused: boolean }) => void) => () => void
    onDownloadEvent: (cb: (payload: BrowserDownloadEventPayload) => void) => () => void
    getNavHistory: (
      webContentsId: number,
    ) => Promise<{ entries: { url: string; title: string }[]; activeIndex: number } | null>
  }
  shortcuts: {
    onBrowserReload: (cb: (payload: { hard: boolean }) => void) => () => void
    onClosePaneTab: (cb: () => void) => () => void
    onOpenSettings: (cb: () => void) => () => void
  }
  terminal: {
    setFocused: (id: number | null) => void
    onClearOptionModifiers: (cb: () => void) => () => void
  }
  pty: {
    spawn: (cols: number, rows: number) => Promise<number>
    connect: (id: number) => Promise<{
      id: number
      snapshot: string
      snapshotCols: number
      snapshotRows: number
      lastSeq: number
      isReattach: boolean
    }>
    disconnect: (id: number) => void
    write: (id: number, data: Uint8Array) => void
    resize: (id: number, cols: number, rows: number) => void
    dispose: (id: number) => void
    onData: (cb: (id: number, seq: number, data: Uint8Array) => void) => () => void
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
    readFileBinaryPreview: (
      tabId: number,
      rel: string
    ) => Promise<{ content: string; mimeType: string } | null>
    writeFile: (tabId: number, rel: string, content: string) => Promise<void>
    createDir: (tabId: number, rel: string) => Promise<void>
    deletePath: (tabId: number, rel: string) => Promise<void>
    renamePath: (tabId: number, fromRel: string, toRel: string) => Promise<void>
    onChanged: (cb: () => void) => () => void
    searchInFiles: (requestId: string, tabId: number, query: string, opts: SearchOptions) => void
    searchCancel: (requestId: string) => void
    onSearchResult: (cb: (requestId: string, result: SearchFileResult) => void) => () => void
    onSearchDone: (cb: (requestId: string, error?: string) => void) => () => void
    listAllFiles: (tabId: number) => Promise<string[]>
  }
  media: {
    getUrl: (tabId: number, rel: string) => Promise<string | null>
  }
  rss: {
    fetchFeed: (url: string) => Promise<FeedResult>
  }
  epub: {
    open: (tabId: number, rel: string) => Promise<EpubBook>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WorkspaceApi
  }
}
