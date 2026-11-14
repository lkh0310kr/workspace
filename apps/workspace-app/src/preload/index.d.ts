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
  isIgnored: boolean
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

export interface EpubSpineItem {
  href: string
  mediaType: string
}

export interface EpubBook {
  bookId: string
  title: string
  spine: EpubSpineItem[]
  sizes: Record<string, number>
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
  system: {
    summary: () => Promise<{
      hostname: string
      platform: string
      release: string
      arch: string
      cpuPercent: number | null
      cpuCores: number
      memoryTotal: number
      memoryAvailable: number
      diskTotal: number | null
      diskAvailable: number | null
      uptimeSeconds: number
    }>
  }
  platform: NodeJS.Platform
  platformInfo: {
    get: () => {
      platform: NodeJS.Platform
      osRelease: string
      arch: string
      shell: string
    }
  }
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
    codexRateLimitStatus: () => Promise<{
      planType: string | null
      session: { usedPercent: number; resetsAt: number | null; windowMinutes: number | null } | null
      weekly: { usedPercent: number; resetsAt: number | null; windowMinutes: number | null } | null
      error: 'no_auth' | 'fetch_failed' | null
    }>
    meterSettingsGet: () => Promise<{ enabled: string[] }>
    meterSettingsSave: (settings: { enabled: string[] }) => Promise<void>
  }
  dialog: {
    openDirectory: (defaultPath?: string) => Promise<DirectoryPickResult>
    pickMediaFile: (kind: 'video' | 'audio' | 'ebook') => Promise<DirectoryPickResult>
  }
  clipboard: {
    writeText: (text: string) => void
    readText: () => Promise<string>
    saveImageAsTempFile: () => Promise<string | null>
  }
  debug: {
    interactionLog: (entry: Record<string, unknown>) => void
    terminalLog: (entry: Record<string, unknown>) => void
    layoutLog: (entry: Record<string, unknown>) => void
    appLog: (
      source: string,
      level: 'log' | 'info' | 'warn' | 'error' | 'debug',
      event: string,
      data?: Record<string, unknown>
    ) => void
    errorLog: (message: string, stack?: string, extra?: Record<string, unknown>) => void
    consoleLog: (level: 'log' | 'info' | 'warn' | 'error' | 'debug', args: unknown[]) => void
    getLogsDir: () => Promise<string>
  }
  browser: {
    onOpenNewTab: (cb: (payload: { hostWebContentsId: number; url: string }) => void) => () => void
    onGuestFocus: (cb: (payload: { webContentsId: number; focused: boolean }) => void) => () => void
    onGuestPointerDown: (cb: (payload: { webContentsId: number }) => void) => () => void
    onHtmlFullscreenChanged: (cb: (active: boolean) => void) => () => void
    onDownloadEvent: (cb: (payload: BrowserDownloadEventPayload) => void) => () => void
    getNavHistory: (
      webContentsId: number
    ) => Promise<{ entries: { url: string; title: string }[]; activeIndex: number } | null>
    goBack: (webContentsId: number) => Promise<boolean>
    goForward: (webContentsId: number) => Promise<boolean>
    goToIndex: (webContentsId: number, index: number) => Promise<boolean>
    focusGuest: (webContentsId: number) => Promise<boolean>
    blurGuest: (webContentsId: number) => Promise<boolean>
  }
  shortcuts: {
    onHome: (cb: () => void) => () => void
    onQuickOpen: (cb: () => void) => () => void
    onFindInFiles: (cb: () => void) => () => void
    onFindInEditor: (cb: () => void) => () => void
    onBrowserReload: (cb: (payload: { hard: boolean }) => void) => () => void
    onBrowserZoom: (
      cb: (payload: { direction: 'in' | 'out'; webContentsId: number }) => void
    ) => () => void
    onClosePaneTab: (cb: () => void) => () => void
    onOpenSettings: (cb: () => void) => () => void
    onNewWorkspaceTab: (cb: () => void) => () => void
    onShortcutModifierReleased: (cb: () => void) => () => void
    onShortcutModifierPressed: (cb: () => void) => () => void
    onSwitchWorkspaceTabIndex: (cb: (payload: { index: number }) => void) => () => void
    onPastePlainText: (cb: () => void) => () => void
    onTerminalPaste: (cb: (payload: { terminalId: number }) => void) => () => void
  }
  terminal: {
    setFocused: (id: number | null) => void
    onClearOptionModifiers: (cb: () => void) => () => void
    onCaptureSessionBuffers: (cb: (terminalIds: number[]) => void) => () => void
    sendSessionBuffers: (payload: { buffersByTerminalId: Record<string, string> }) => void
    onOscTitle: (
      cb: (payload: { terminalId: number; rawTitle: string; normalizedTitle: string }) => void
    ) => () => void
    onPtySpawned: (cb: (payload: { terminalId: number }) => void) => () => void
  }
  agentStatus: {
    onSet: (
      cb: (data: import('../shared/agent-status-ipc').AgentStatusIpcPayload) => void
    ) => () => void
    onClear: (
      cb: (data: import('../shared/agent-status-ipc').AgentStatusClearIpcPayload) => void
    ) => () => void
    registerTerminalPane: (terminalId: number, paneKey: string) => void
    unregisterTerminalPane: (terminalId: number) => void
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
    acknowledgeOutput: (id: number, seq: number) => void
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
    readFile: (tabId: number, rel: string) => Promise<string | null>
    readFileBinaryPreview: (
      tabId: number,
      rel: string
    ) => Promise<{ content: string; mimeType: string } | null>
    writeFile: (tabId: number, rel: string, content: string) => Promise<void>
    writeFileIfUnchanged: (
      tabId: number,
      rel: string,
      expected: string,
      content: string
    ) => Promise<boolean>
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
  model3d: {
    openPreview: (
      tabId: number,
      rel: string
    ) => Promise<import('../shared/model3d/types').SceneManifest>
    openAsset: (
      request: import('../shared/model3d/types').AssetOpenRequest
    ) => Promise<import('../shared/model3d/types').ImportJob>
    getImportJob: (jobId: string) => Promise<import('../shared/model3d/types').ImportJob | null>
    onImportStatus: (
      handler: (job: import('../shared/model3d/types').ImportJob) => void
    ) => () => void
    getUrl: (tabId: number, rel: string) => Promise<string | null>
    log: (event: string, data?: Record<string, unknown>) => Promise<void>
    logs: (limit?: number) => Promise<Record<string, unknown>[]>
  }
  cad: {
    openFile: (
      tabId: number,
      rel: string
    ) => Promise<import('../shared/cadViewer').CadViewerOpenResult>
  }
  epub: {
    open: (tabId: number, rel: string) => Promise<EpubBook>
    openAbsolute: (absolutePath: string) => Promise<EpubBook>
    getState: (
      tabId: number | null,
      rel: string | null,
      absolutePath?: string
    ) => Promise<import('../shared/ebookState').EbookBookState>
    saveState: (
      tabId: number | null,
      rel: string | null,
      absolutePath: string | undefined,
      patch: Partial<import('../shared/ebookState').EbookBookState>
    ) => Promise<import('../shared/ebookState').EbookBookState>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WorkspaceApi
    pkmsDesktop: PkmsDesktopApi
    workspaceHome: WorkspaceHomeApi
  }
}

export interface PkmsDesktopApi {
  openVerification: (url: string) => Promise<void>
  openServiceOAuth: (url: string) => Promise<void>
  request: <T = unknown>(
    path: string,
    options: import('../shared/pkmsClient').PkmsRequestOptions
  ) => Promise<import('../shared/pkmsClient').PkmsResponse<T>>
  fetchAsset: (path: string) => Promise<import('../shared/pkmsClient').PkmsAssetResponse>
  syncBridgeStatus: (
    workspaceId: string
  ) => Promise<import('../shared/pkmsSyncBridge').PkmsSyncBridgeStatus>
  syncBridgeTree: (
    workspaceId: string,
    knownRevision?: number
  ) => Promise<{
    revision: number
    files?: Array<
      import('../shared/pkmsClient').PkmsFile & { sha?: string | null; upToDate?: boolean }
    >
  }>
  onLocalTreeChanged: (
    listener: (change: { workspaceId: string; path: string | null }) => void
  ) => () => void
  connectSyncBridge: (
    workspaceId: string
  ) => Promise<import('../shared/pkmsSyncBridge').PkmsSyncBridgeConnectResult>
  disconnectSyncBridge: (
    workspaceId: string
  ) => Promise<import('../shared/pkmsSyncBridge').PkmsSyncBridgeStatus>
  scanSyncBridge: (
    workspaceId: string
  ) => Promise<import('../shared/pkmsSyncBridge').PkmsSyncBridgeStatus>
  updateSyncBridgeExclusions: (
    workspaceId: string,
    paths: string[]
  ) => Promise<import('../shared/pkmsSyncBridge').PkmsSyncBridgeStatus>
  readLocalMarkdown: (
    workspaceId: string,
    relativePath: string
  ) => Promise<{ text: string; revision: string }>
  writeLocalMarkdown: (
    workspaceId: string,
    relativePath: string,
    text: string,
    revision: string
  ) => Promise<{ revision: string }>
  listLocalDirectory: (
    workspaceId: string,
    relativePath: string
  ) => Promise<import('../shared/pkmsClient').PkmsFile[]>
  getLocalFile: (
    workspaceId: string,
    id: string
  ) => Promise<import('../shared/pkmsClient').PkmsFile | null>
  revealLocalItem: (workspaceId: string, relativePath: string) => Promise<void>
  createLocalItem: (
    workspaceId: string,
    parent: string,
    kind: 'markdown' | 'folder',
    name: string
  ) => Promise<import('../shared/pkmsClient').PkmsFile>
  renameLocalItem: (
    workspaceId: string,
    id: string,
    name: string
  ) => Promise<import('../shared/pkmsClient').PkmsFile>
  moveLocalItems: (
    workspaceId: string,
    ids: string[],
    parent: string,
    overwritePaths?: string[]
  ) => Promise<Array<{ oldId: string; file: import('../shared/pkmsClient').PkmsFile }>>
  deleteLocalItems: (workspaceId: string, ids: string[]) => Promise<void>
}

export interface WorkspaceHomeApi {
  request: <T = unknown>(
    path: string,
    options: import('../shared/pkmsClient').PkmsRequestOptions
  ) => Promise<import('../shared/pkmsClient').PkmsResponse<T>>
}
