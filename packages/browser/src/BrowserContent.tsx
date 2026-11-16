import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import { BrowserAddressBar, recordBrowserVisit } from './address-bar'
import { normalizeBrowserNavigationUrl } from './browserUrl'
import {
  applyBrowserPageViewportLayout,
  ensureBrowserPageViewport,
  parkBrowserPageViewport,
  syncBrowserPageChromeInset
} from './browserPageViewport'
import { useBrowserPageSlotViewport } from './useBrowserPageSlotViewport'
import { readBrowserNavigationState } from './browserNavigationState'
import { dispatchLocalBrowserZoom, registerBrowserZoomPersist } from './browserZoom'
import { loadBrowserPageWebviewUrl, reloadBrowserPageWebview } from './browserPageWebviewActions'
import { BrowserNavButton } from './BrowserNavButton'
import { BrowserDownloadsBar, type BrowserDownloadItem } from './downloads'
import type { BrowserPaneHost, BrowserPaneItem } from './BrowserPaneHost'
import type { BrowserWebviewEventMap, BrowserWebviewPort } from './BrowserWebview'
import { browserPageGuestNeedsAttach, resolveBrowserPageWebview } from './browserPageGuestRecovery'
import './browser.css'
import { useBrowserChromeFocus } from './useBrowserChromeFocus'
import { useBrowserGuestActivationFocus } from './useBrowserGuestActivationFocus'
import { useWebviewGuestFocus } from './useWebviewGuestFocus'

interface Props {
  host: BrowserPaneHost
  tabId: number
  paneNodeId: string
  item: BrowserPaneItem
  paneVisible: boolean
  chipActive: boolean
  onUpdate: (patch: Partial<BrowserPaneItem>) => void
  onOpenNewTab: (url: string) => void
  onFocusPaneGroup: () => void
  onSelectPaneTab: (id: string) => void
}

const DEFAULT_URL = 'https://www.google.com'

function browserPagePaneClassName(isActive: boolean, isPaintable: boolean): string {
  if (isActive) return 'browser-page-pane browser-page-pane--active'
  if (isPaintable) return 'browser-page-pane browser-page-pane--paintable'
  return 'browser-page-pane browser-page-pane--hidden'
}

export function BrowserContent({
  host,
  tabId,
  paneNodeId,
  item,
  paneVisible,
  chipActive,
  onUpdate,
  onOpenNewTab,
  onFocusPaneGroup,
  onSelectPaneTab
}: Props) {
  const hostRef = useRef(host)
  useEffect(() => {
    hostRef.current = host
  }, [host])
  const getPersistentWebview = useCallback(
    (tabItemId: string) => hostRef.current.getPersistentWebview(tabItemId),
    []
  )
  const isActive = paneVisible && chipActive
  const isPaintable = paneVisible
  const chipShown = isActive
  const dragPassthroughActive = useSyncExternalStore(
    host.subscribeDragPassthrough,
    host.isDragPassthroughActive,
    () => false
  )

  const slotViewport = useBrowserPageSlotViewport(paneNodeId)
  const [attachNonce, setAttachNonce] = useState(0)
  const guestRecoveryAttemptsRef = useRef(0)

  const chromeHeaderRef = useRef<HTMLDivElement>(null)
  const webviewRef = useRef<BrowserWebviewPort | null>(null)
  const addressInputRef = useRef<HTMLInputElement | null>(null)
  const [addressInput, setAddressInput] = useState(item.url ?? DEFAULT_URL)
  const [currentUrl, setCurrentUrl] = useState(item.url ?? DEFAULT_URL)
  const [loading, setLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [webContentsId, setWebContentsId] = useState<number | null>(null)
  const [rendererGone, setRendererGone] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [downloadItems, setDownloadItems] = useState<BrowserDownloadItem[]>([])

  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const onOpenNewTabRef = useRef(onOpenNewTab)
  onOpenNewTabRef.current = onOpenNewTab
  const chipShownRef = useRef(chipShown)
  chipShownRef.current = chipShown
  const isPaintableRef = useRef(isPaintable)
  isPaintableRef.current = isPaintable
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const onFocusPaneGroupRef = useRef(onFocusPaneGroup)
  onFocusPaneGroupRef.current = onFocusPaneGroup
  const onSelectPaneTabRef = useRef(onSelectPaneTab)
  onSelectPaneTabRef.current = onSelectPaneTab
  const domReadyRef = useRef(false)
  const pendingNavigationRef = useRef<string | null>(null)

  const guestFocus = useWebviewGuestFocus(webviewRef, host)
  const { keepAddressBarFocusRef } = useBrowserChromeFocus({
    chipShown,
    addressBarInputRef: addressInputRef,
    guestFocus
  })
  useBrowserGuestActivationFocus({
    host,
    isActive: chipShown,
    workspaceTabId: tabId,
    paneTabItemId: item.id,
    webviewRef,
    keepAddressBarFocusRef,
    dragPassthroughActive,
    webviewReady: webContentsId !== null
  })

  // Orca use-browser-page-webview-url-sync useLayoutEffect
  useLayoutEffect(() => {
    applyBrowserPageViewportLayout(item.id, { paintable: isPaintable, active: isActive })
    const syncChromeInset = (): void => {
      const header = chromeHeaderRef.current
      if (!header) return
      syncBrowserPageChromeInset(item.id, header.offsetHeight)
    }
    syncChromeInset()
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncChromeInset)
    const header = chromeHeaderRef.current
    if (header) {
      resizeObserver?.observe(header)
    }
    return () => {
      resizeObserver?.disconnect()
    }
  }, [isActive, isPaintable, item.id, slotViewport])

  // If the overlay slot's viewport shell was recreated while this effect's
  // deps stayed the same, the guest can sit detached in the registry with
  // a stale ref — chrome still renders but reload/devtools silently no-op.
  useEffect(() => {
    if (!slotViewport || !paneVisible) return
    if (!browserPageGuestNeedsAttach(item.id, webviewRef.current, getPersistentWebview)) {
      guestRecoveryAttemptsRef.current = 0
      return
    }
    if (guestRecoveryAttemptsRef.current >= 3) return
    guestRecoveryAttemptsRef.current += 1
    hostRef.current.logFocus('BrowserContent.guestRecovery', 'reattach orphaned browser guest', {
      tabItemId: item.id,
      paneNodeId,
      attempt: guestRecoveryAttemptsRef.current
    })
    setAttachNonce((nonce) => nonce + 1)
  }, [slotViewport, paneVisible, chipActive, item.id, paneNodeId])

  const syncNavState = useCallback(() => {
    const webview = webviewRef.current
    const state = readBrowserNavigationState(webview, domReadyRef.current)
    setCanGoBack(state.canGoBack)
    setCanGoForward(state.canGoForward)
  }, [])

  const goBack = useCallback(() => {
    const webview = webviewRef.current
    if (!webview?.canGoBack()) return
    webview.goBack()
    syncNavState()
  }, [syncNavState])

  const goForward = useCallback(() => {
    const webview = webviewRef.current
    if (!webview?.canGoForward()) return
    webview.goForward()
    syncNavState()
  }, [syncNavState])

  // Orca attachBrowserPageWebview / use-browser-page-webview-lifecycle
  useEffect(() => {
    const paneHost = hostRef.current
    if (!slotViewport) return

    const viewport = ensureBrowserPageViewport(item.id, paneNodeId)
    if (!viewport) return

    const initialZoom = item.zoomFactor ?? 1
    const ensured = paneHost.ensureWebview({
      tabItemId: item.id,
      container: viewport.container,
      initialUrl: item.url ?? DEFAULT_URL,
      initialZoom
    })
    if (!ensured) return

    const guest = ensured.webview
    let disposed = false
    domReadyRef.current = false
    webviewRef.current = guest

    applyBrowserPageViewportLayout(item.id, {
      paintable: isPaintableRef.current,
      active: isActiveRef.current
    })

    try {
      setWebContentsId(guest.getWebContentsId())
    } catch {
      setWebContentsId(null)
    }

    const onStartLoading = (): void => {
      if (!disposed) setLoading(true)
    }
    const onStopLoading = (): void => {
      if (disposed) return
      setLoading(false)
      syncNavState()
    }
    const onNavigate = (e: BrowserWebviewEventMap['did-navigate']): void => {
      if (disposed) return
      setAddressInput(e.url)
      setCurrentUrl(e.url)
      onUpdateRef.current({ url: e.url })
      syncNavState()
    }
    const onNavigateInPage = (e: BrowserWebviewEventMap['did-navigate-in-page']): void => {
      if (disposed || !domReadyRef.current || !guest.isConnected) return
      setAddressInput(e.url)
      setCurrentUrl(e.url)
      onUpdateRef.current({ url: e.url })
      syncNavState()
    }
    const onPageTitleUpdated = (e: BrowserWebviewEventMap['page-title-updated']): void => {
      if (disposed) return
      onUpdateRef.current({ title: e.title })
      try {
        recordBrowserVisit(guest.getURL(), e.title)
      } catch {
        /* guest mid-teardown */
      }
    }
    const onFaviconUpdated = (e: BrowserWebviewEventMap['page-favicon-updated']): void => {
      if (disposed) return
      const favicon = e.favicons[0]
      if (favicon) onUpdateRef.current({ favicon })
    }
    const onRendererGone = (): void => {
      if (!disposed) setRendererGone(true)
    }
    const onDomReady = (): void => {
      if (disposed || !guest.isConnected) return
      domReadyRef.current = true
      setRendererGone(false)
      setLoadError(null)
      try {
        setWebContentsId(guest.getWebContentsId())
      } catch {
        setWebContentsId(null)
      }
      syncNavState()
      const pending = pendingNavigationRef.current
      if (pending) {
        pendingNavigationRef.current = null
        loadBrowserPageWebviewUrl(guest, pending)
      }
      if (chipShownRef.current) {
        paneHost.requestGuestFocus(tabId, item.id, 'dom-ready')
      }
    }
    const onFailLoad = (_e: BrowserWebviewEventMap['did-fail-load']): void => {
      if (disposed) return
      setLoadError('Could not load this page. Check the address and try again.')
    }

    guest.addEventListener('did-start-loading', onStartLoading)
    guest.addEventListener('did-stop-loading', onStopLoading)
    guest.addEventListener('did-navigate', onNavigate)
    guest.addEventListener('did-navigate-in-page', onNavigateInPage)
    guest.addEventListener('page-title-updated', onPageTitleUpdated)
    guest.addEventListener('page-favicon-updated', onFaviconUpdated)
    guest.addEventListener('render-process-gone', onRendererGone)
    guest.addEventListener('dom-ready', onDomReady)
    guest.addEventListener('did-fail-load', onFailLoad)

    const onContainerPointerDown = (): void => {
      onFocusPaneGroupRef.current()
      if (!isActiveRef.current) {
        onSelectPaneTabRef.current(item.id)
        return
      }
      if (document.activeElement === addressInputRef.current) return
      hostRef.current.logFocus(
        'BrowserContent.viewportPointerDown',
        'pointer down on guest container'
      )
      paneHost.setActiveWebview(guest)
      void paneHost.focusGuest(guest, 'viewport-pointerdown')
    }
    viewport.container.addEventListener('pointerdown', onContainerPointerDown)

    const unregisterWebview = paneHost.registerWebviewReference(guest)
    paneHost.registerWebview(guest, {
      workspaceTabId: tabId,
      paneNodeId,
      paneTabItemId: item.id,
      initialPaneVisible: paneVisible,
      initialChipActive: chipActive
    })

    const onFocus = (): void => {
      paneHost.setActiveWebview(guest)
      onFocusPaneGroupRef.current()
      hostRef.current.logFocus('BrowserContent.webviewFocus', 'host webview focus')
    }
    const onBlur = (): void => {
      if (paneHost.getActiveWebview() === guest) paneHost.setActiveWebview(null)
    }
    guest.addEventListener('focus', onFocus)
    guest.addEventListener('blur', onBlur)

    const unlistenOpenNewTab = paneHost.onOpenNewTab(({ hostWebContentsId, url }) => {
      let myId: number
      try {
        myId = guest.getWebContentsId()
      } catch {
        return
      }
      if (myId !== hostWebContentsId) return
      onOpenNewTabRef.current(url)
    })

    return () => {
      disposed = true
      domReadyRef.current = false
      pendingNavigationRef.current = null
      guest.removeEventListener('did-start-loading', onStartLoading)
      guest.removeEventListener('did-stop-loading', onStopLoading)
      guest.removeEventListener('did-navigate', onNavigate)
      guest.removeEventListener('did-navigate-in-page', onNavigateInPage)
      guest.removeEventListener('page-title-updated', onPageTitleUpdated)
      guest.removeEventListener('page-favicon-updated', onFaviconUpdated)
      guest.removeEventListener('render-process-gone', onRendererGone)
      guest.removeEventListener('dom-ready', onDomReady)
      guest.removeEventListener('did-fail-load', onFailLoad)
      viewport.container.removeEventListener('pointerdown', onContainerPointerDown)
      guest.removeEventListener('focus', onFocus)
      guest.removeEventListener('blur', onBlur)
      if (paneHost.getActiveWebview() === guest) paneHost.setActiveWebview(null)
      paneHost.detachWebview(guest)
      unregisterWebview()
      unlistenOpenNewTab()
      parkBrowserPageViewport(item.id)
      webviewRef.current = null
      setWebContentsId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, item.id, paneNodeId, slotViewport, attachNonce, syncNavState])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return
    hostRef.current.updateWebviewPaneNode(webview, paneNodeId)
  }, [paneNodeId])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    applyBrowserPageViewportLayout(item.id, { paintable: isPaintable, active: isActive })

    hostRef.current.setPaneChipState(tabId, item.id, {
      paneVisible,
      chipActive
    })

    if (chipShown) {
      hostRef.current.setWebviewInputLock(webview, false)
      hostRef.current.setActiveWebview(webview)
      hostRef.current.requestKeyboardSurface('browser-chip-shown')
      hostRef.current.requestGuestFocus(tabId, item.id, 'chip-shown')
      hostRef.current.logFocus(
        'BrowserContent.chipShown',
        'chip shown',
        hostRef.current.snapshotFocus(webview)
      )
    }
    if (!chipShown) {
      hostRef.current.logFocus(
        'BrowserContent.chipHidden',
        'chip hidden',
        hostRef.current.snapshotFocus(webview)
      )
      addressInputRef.current?.blur()
      hostRef.current.setWebviewInputLock(webview, true)
      hostRef.current.moveFocusToRendererBeforeHide()
      if (hostRef.current.getActiveWebview() === webview) {
        hostRef.current.setActiveWebview(null)
      }
    }
  }, [paneVisible, chipActive, chipShown, isPaintable, isActive, tabId, item.id])

  useEffect(() => {
    const refresh = (): void => {
      if (webContentsId === null) {
        setDownloadItems([])
        return
      }
      setDownloadItems(hostRef.current.getDownloads(webContentsId))
    }
    refresh()
    return hostRef.current.subscribeDownloads(refresh)
  }, [webContentsId])

  useEffect(() => {
    return registerBrowserZoomPersist(item.id, (factor) => {
      onUpdateRef.current({ zoomFactor: factor })
    })
  }, [item.id])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!chipShown) return
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key !== '=' && e.key !== '+' && e.key !== '-' && e.key !== '_') return
      e.preventDefault()
      e.stopPropagation()
      dispatchLocalBrowserZoom(e.key === '=' || e.key === '+' ? 'in' : 'out')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [chipShown])

  const refocusBrowserGuest = useCallback(() => {
    hostRef.current.requestKeyboardSurface('browser-address-bar-dismiss')
    hostRef.current.requestGuestFocus(tabId, item.id, 'address-bar-dismiss')
  }, [tabId, item.id])

  const navigate = (url: string): void => {
    const normalized = normalizeBrowserNavigationUrl(url, true)
    if (!normalized) return
    addressInputRef.current?.blur()
    const webview = resolveBrowserPageWebview(item.id, webviewRef, getPersistentWebview)
    if (!webview) return
    const result = loadBrowserPageWebviewUrl(webview, normalized)
    if (result === 'not-ready') {
      pendingNavigationRef.current = normalized
    }
    if (chipShown) {
      hostRef.current.requestGuestFocus(tabId, item.id, 'navigate')
    }
  }

  const handleChromePointerDown = (): void => {
    onFocusPaneGroupRef.current()
    if (!isActiveRef.current) {
      onSelectPaneTabRef.current(item.id)
    }
  }

  return (
    <div
      data-browser-page-pane-id={item.id}
      className={browserPagePaneClassName(isActive, isPaintable)}
      inert={!isActive}
      aria-hidden={!isActive}
    >
      <div
        ref={chromeHeaderRef}
        className="browser-page-chrome-header"
        onPointerDown={handleChromePointerDown}
      >
        <div className="pane-header pane-header-browser">
          <div className="browser-nav">
            <BrowserNavButton
              registerPortal={host.registerPortal}
              onDismissPortals={host.onDismissPortals}
              fetchHistory={host.fetchNavHistory}
              goToHistoryIndex={host.goToNavHistoryIndex}
              direction="back"
              disabled={!canGoBack}
              active={chipShown}
              webContentsId={webContentsId}
              onNavigate={syncNavState}
              onNavigateAction={goBack}
            />
            <BrowserNavButton
              registerPortal={host.registerPortal}
              onDismissPortals={host.onDismissPortals}
              fetchHistory={host.fetchNavHistory}
              goToHistoryIndex={host.goToNavHistoryIndex}
              direction="forward"
              disabled={!canGoForward}
              active={chipShown}
              webContentsId={webContentsId}
              onNavigate={syncNavState}
              onNavigateAction={goForward}
            />
            <button
              type="button"
              className="browser-nav-btn"
              title={loading ? 'Stop' : 'Reload'}
              onClick={() => {
                const wv = resolveBrowserPageWebview(item.id, webviewRef, getPersistentWebview)
                if (!wv) return
                if (loading) {
                  try {
                    wv.stop()
                  } catch {
                    /* guest not ready */
                  }
                  return
                }
                reloadBrowserPageWebview(wv, { ignoreCache: false })
              }}
            >
              {loading ? '×' : '↻'}
            </button>
            <button
              type="button"
              className="browser-nav-btn browser-nav-btn-devtools"
              title="Toggle DevTools"
              onClick={() => {
                const wv = resolveBrowserPageWebview(item.id, webviewRef, getPersistentWebview)
                if (!wv) return
                if (wv.isDevToolsOpened()) wv.closeDevTools()
                else wv.openDevTools()
              }}
            >
              {'</>'}
            </button>
          </div>
          <BrowserAddressBar
            value={addressInput}
            currentUrl={currentUrl}
            onChange={setAddressInput}
            onNavigate={navigate}
            onDismiss={chipShown ? refocusBrowserGuest : undefined}
            registerPortal={host.registerPortal}
            inputRef={addressInputRef}
          />
        </div>
        {loading ? <div className="browser-loading-bar" aria-hidden="true" /> : null}
        <BrowserDownloadsBar
          items={downloadItems}
          onReveal={(path) => {
            hostRef.current.revealDownload(path)
          }}
        />
      </div>
      {rendererGone && chipShown && (
        <div className="browser-crash-banner pointer-events-auto">
          <span>This page crashed.</span>
          <button
            type="button"
            className="browser-crash-reload"
            onClick={() => {
              const wv = resolveBrowserPageWebview(item.id, webviewRef, getPersistentWebview)
              if (!wv) return
              reloadBrowserPageWebview(wv, { ignoreCache: false })
            }}
          >
            Reload
          </button>
        </div>
      )}
      {loadError && !rendererGone && chipShown && (
        <div className="browser-crash-banner pointer-events-auto">
          <span>{loadError}</span>
        </div>
      )}
    </div>
  )
}
