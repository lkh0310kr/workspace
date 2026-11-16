export interface BrowserWebviewEventMap {
  'did-start-loading': Event
  'did-stop-loading': Event
  'did-navigate': Event & { url: string }
  'did-navigate-in-page': Event & { url: string }
  'page-title-updated': Event & { title: string }
  'page-favicon-updated': Event & { favicons: string[] }
  'render-process-gone': Event
  'dom-ready': Event
  'did-fail-load': Event
  focus: FocusEvent
  blur: FocusEvent
}

/** Browser guest surface consumed by the feature; Desktop adapts Electron's webview. */
export interface BrowserWebviewPort {
  readonly isConnected: boolean
  readonly parentElement: HTMLElement | null
  readonly dataset: DOMStringMap
  addEventListener<K extends keyof BrowserWebviewEventMap>(
    type: K,
    listener: (event: BrowserWebviewEventMap[K]) => void
  ): void
  removeEventListener<K extends keyof BrowserWebviewEventMap>(
    type: K,
    listener: (event: BrowserWebviewEventMap[K]) => void
  ): void
  focus(): void
  blur(): void
  getWebContentsId(): number
  getURL(): string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  getZoomFactor(): number
  setZoomFactor(factor: number): void
  reload(): void
  reloadIgnoringCache(): void
  loadURL(url: string): Promise<void>
  stop(): void
  isDevToolsOpened(): boolean
  closeDevTools(): void
  openDevTools(): void
}
