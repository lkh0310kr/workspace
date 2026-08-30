import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  JapaneseDbStatus,
  JapaneseKanjiDetail,
  JapaneseLexemeDetail,
  JapaneseSearchResult,
  JapaneseStrokeData,
  JapaneseStrokeRecognitionResult,
  JapanesePracticeScore,
  JapaneseSrsCard,
} from '../shared/japaneseTypes'

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

export type DirectoryPickResult =
  | { ok: true; path: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string }

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
  platform: NodeJS.Platform
  isWsl: boolean
  windowControls: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
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
    openDirectory: (defaultPath?: string) => Promise<DirectoryPickResult>
    pickMediaFile: (kind: 'video' | 'audio' | 'ebook') => Promise<DirectoryPickResult>
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
    onHtmlFullscreenChanged: (cb: (active: boolean) => void) => () => void
    onDownloadEvent: (cb: (payload: BrowserDownloadEventPayload) => void) => () => void
    getNavHistory: (
      webContentsId: number,
    ) => Promise<{ entries: { url: string; title: string }[]; activeIndex: number } | null>
    goBack: (webContentsId: number) => Promise<boolean>
    goForward: (webContentsId: number) => Promise<boolean>
    goToIndex: (webContentsId: number, index: number) => Promise<boolean>
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
    spawn: (cols: number, rows: number, tabId?: number) => Promise<number>
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
    renameTab: (tabId: number, title: string) => Promise<void>
    reorderTabs: (orderedIds: number[]) => Promise<void>
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
    onChanged: (cb: (paths: string[]) => void) => () => void
    searchInFiles: (requestId: string, tabId: number, query: string, opts: SearchOptions) => void
    searchCancel: (requestId: string) => void
    onSearchResult: (cb: (requestId: string, result: SearchFileResult) => void) => () => void
    onSearchDone: (cb: (requestId: string, error?: string) => void) => () => void
    listAllFiles: (tabId: number) => Promise<string[]>
  }
  media: {
    getUrl: (tabId: number, rel: string) => Promise<string | null>
    getUrlAbsolute: (absolutePath: string) => Promise<string>
  }
  rss: {
    fetchFeed: (url: string) => Promise<FeedResult>
  }
  japanese: {
    dbStatus: () => Promise<JapaneseDbStatus>
    search: (query: string, limit?: number) => Promise<JapaneseSearchResult>
    getLexeme: (entSeq: number) => Promise<JapaneseLexemeDetail | null>
    getKanji: (literal: string) => Promise<JapaneseKanjiDetail | null>
    getStrokes: (literal: string) => Promise<JapaneseStrokeData | null>
    searchByKanji: (literal: string) => Promise<JapaneseSearchResult>
    recognizeStrokes: (strokes: { points: { x: number; y: number }[] }[]) => Promise<JapaneseStrokeRecognitionResult>
    scorePractice: (literal: string, strokes: { points: { x: number; y: number }[] }[]) => Promise<JapanesePracticeScore>
    srsAdd: (entSeq: number) => Promise<JapaneseSrsCard>
    srsReview: (entSeq: number, quality: number) => Promise<JapaneseSrsCard>
    srsDue: (limit?: number) => Promise<JapaneseSrsCard[]>
  }
  epub: {
    open: (tabId: number, rel: string) => Promise<EpubBook>
    openAbsolute: (absolutePath: string) => Promise<EpubBook>
  }
  engine: {
    getBundleUrl: (
      tabId: number,
      rel: string,
      entry?: string,
    ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>
    exportGodotWeb: (tabId: number, rel: string) => Promise<{ ok: boolean; outputRel?: string; error?: string }>
  }
  project: {
    registerApp: (tabId: number, kind: string, rel: string, title?: string) => Promise<unknown>
  }
  worldEngine: {
    launch: (tabId: number, rel: string) => Promise<{ ok: boolean; error?: string }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WorkspaceApi
  }
}
