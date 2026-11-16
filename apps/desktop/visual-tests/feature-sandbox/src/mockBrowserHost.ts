import type { BrowserPaneHost, BrowserWebviewEventMap, BrowserWebviewPort } from '@workspace/browser'

type Listener<K extends keyof BrowserWebviewEventMap> = (event: BrowserWebviewEventMap[K]) => void

class MemoryBrowserWebview implements BrowserWebviewPort {
  readonly element = document.createElement('div')
  private readonly listeners = new Map<keyof BrowserWebviewEventMap, Set<(event: never) => void>>()
  private history: string[]
  private historyIndex = 0
  private zoom = 1
  private devToolsOpen = false

  constructor(private readonly webContentsId: number, initialUrl: string) {
    this.element.className = 'sandbox-webview'
    this.element.tabIndex = 0
    this.element.setAttribute('role', 'document')
    this.history = [initialUrl]
    this.renderUrl(initialUrl)
    this.element.addEventListener('focus', (event) => this.emit('focus', event))
    this.element.addEventListener('blur', (event) => this.emit('blur', event))
  }

  get isConnected(): boolean {
    return this.element.isConnected
  }

  get parentElement(): HTMLElement | null {
    return this.element.parentElement
  }

  get dataset(): DOMStringMap {
    return this.element.dataset
  }

  addEventListener<K extends keyof BrowserWebviewEventMap>(type: K, listener: Listener<K>): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: never) => void>()
    listeners.add(listener as (event: never) => void)
    this.listeners.set(type, listeners)
  }

  removeEventListener<K extends keyof BrowserWebviewEventMap>(
    type: K,
    listener: Listener<K>
  ): void {
    this.listeners.get(type)?.delete(listener as (event: never) => void)
  }

  focus(): void {
    this.element.focus()
  }

  blur(): void {
    this.element.blur()
  }

  getWebContentsId(): number {
    return this.webContentsId
  }

  getURL(): string {
    return this.history[this.historyIndex] ?? 'about:blank'
  }

  canGoBack(): boolean {
    return this.historyIndex > 0
  }

  canGoForward(): boolean {
    return this.historyIndex < this.history.length - 1
  }

  goBack(): void {
    if (!this.canGoBack()) return
    this.historyIndex -= 1
    this.finishNavigation('did-navigate-in-page')
  }

  goForward(): void {
    if (!this.canGoForward()) return
    this.historyIndex += 1
    this.finishNavigation('did-navigate-in-page')
  }

  getZoomFactor(): number {
    return this.zoom
  }

  setZoomFactor(factor: number): void {
    this.zoom = factor
    this.element.style.zoom = String(factor)
  }

  reload(): void {
    void this.loadURL(this.getURL())
  }

  reloadIgnoringCache(): void {
    this.reload()
  }

  async loadURL(url: string): Promise<void> {
    this.emit('did-start-loading', new Event('did-start-loading'))
    this.history = [...this.history.slice(0, this.historyIndex + 1), url]
    this.historyIndex = this.history.length - 1
    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        this.finishNavigation('did-navigate')
        this.emit('page-title-updated', Object.assign(new Event('page-title-updated'), { title: url }))
        this.emit('did-stop-loading', new Event('did-stop-loading'))
        resolve()
      }, 80)
    })
  }

  stop(): void {
    this.emit('did-stop-loading', new Event('did-stop-loading'))
  }

  isDevToolsOpened(): boolean {
    return this.devToolsOpen
  }

  closeDevTools(): void {
    this.devToolsOpen = false
  }

  openDevTools(): void {
    this.devToolsOpen = true
  }

  dispatchDomReady(): void {
    this.emit('dom-ready', new Event('dom-ready'))
  }

  private finishNavigation(type: 'did-navigate' | 'did-navigate-in-page'): void {
    const url = this.getURL()
    this.renderUrl(url)
    this.emit(type, Object.assign(new Event(type), { url }))
  }

  private renderUrl(url: string): void {
    this.element.innerHTML = `<div class="sandbox-page"><span>MOCK BROWSER PAGE</span><strong>${escapeHtml(url)}</strong><p>Navigation stays inside this sandbox.</p></div>`
  }

  private emit<K extends keyof BrowserWebviewEventMap>(type: K, event: BrowserWebviewEventMap[K]): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never)
  }
}

function escapeHtml(value: string): string {
  const node = document.createElement('span')
  node.textContent = value
  return node.innerHTML
}

export function createMemoryBrowserHost(): BrowserPaneHost {
  const byTabId = new Map<string, MemoryBrowserWebview>()
  const openNewTabListeners = new Set<(event: { hostWebContentsId: number; url: string }) => void>()
  const portalDismissListeners = new Set<() => void>()
  let activeWebview: MemoryBrowserWebview | null = null
  let nextWebContentsId = 10

  const asMemory = (webview: BrowserWebviewPort): MemoryBrowserWebview =>
    webview as MemoryBrowserWebview

  return {
    closeTabItem(tabItemId) {
      const webview = byTabId.get(tabItemId)
      if (!webview) return
      webview.element.remove()
      byTabId.delete(tabItemId)
      if (activeWebview === webview) activeWebview = null
    },
    registerPortal: () => () => undefined,
    registerWebview: () => undefined,
    detachWebview(webview) {
      asMemory(webview).element.remove()
    },
    updateWebviewPaneNode: () => undefined,
    setPaneChipState: () => undefined,
    requestGuestFocus(_workspaceTabId, paneTabItemId) {
      byTabId.get(paneTabItemId)?.focus()
    },
    registerWebviewReference: () => () => undefined,
    getActiveWebview: () => activeWebview,
    setActiveWebview(webview) {
      activeWebview = webview ? asMemory(webview) : null
    },
    moveFocusToRendererBeforeHide() {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    },
    focusGuest(webview) {
      asMemory(webview).focus()
    },
    requestKeyboardSurface: () => undefined,
    onOpenNewTab(listener) {
      openNewTabListeners.add(listener)
      return () => openNewTabListeners.delete(listener)
    },
    onDismissPortals(handler) {
      portalDismissListeners.add(handler)
      return () => portalDismissListeners.delete(handler)
    },
    async fetchNavHistory(webContentsId) {
      const webview = [...byTabId.values()].find((entry) => entry.getWebContentsId() === webContentsId)
      if (!webview) return null
      return {
        entries: [{ url: webview.getURL(), title: webview.getURL() }],
        activeIndex: 0
      }
    },
    async goToNavHistoryIndex() {},
    ensureWebview({ tabItemId, container, initialUrl, initialZoom }) {
      let webview = byTabId.get(tabItemId)
      const created = !webview
      if (!webview) {
        webview = new MemoryBrowserWebview(nextWebContentsId++, initialUrl)
        byTabId.set(tabItemId, webview)
      }
      if (webview.element.parentElement !== container) container.appendChild(webview.element)
      webview.setZoomFactor(initialZoom)
      if (created) window.setTimeout(() => webview?.dispatchDomReady(), 0)
      return { webview, created }
    },
    getPersistentWebview: (tabItemId) => byTabId.get(tabItemId) ?? null,
    setWebviewInputLock(webview, inputLocked) {
      asMemory(webview).element.dataset.inputLocked = String(inputLocked)
    },
    getDownloads: () => [],
    subscribeDownloads: () => () => undefined,
    revealDownload: () => undefined,
    isGuestInteractive: () => true,
    isGuestWebContentsFocused: (webContentsId) => activeWebview?.getWebContentsId() === webContentsId,
    isWebviewHostFocused: (webview) => document.activeElement === asMemory(webview).element,
    isDragPassthroughActive: () => false,
    subscribeDragPassthrough: () => () => undefined,
    logFocus: () => undefined,
    snapshotFocus: (webview) => ({
      activeWebContentsId: activeWebview?.getWebContentsId() ?? null,
      requestedWebContentsId: webview?.getWebContentsId() ?? null
    })
  }
}
