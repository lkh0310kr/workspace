export {
  BrowserAddressBar,
  getBrowserHistory,
  recordBrowserVisit,
  buildAddressBarSuggestions
} from './address-bar'
export type { BrowserHistoryEntry, AddressBarSuggestion } from './address-bar'
export { BLANK_URL, normalizeBrowserNavigationUrl } from './browserUrl'
export {
  browserTabUrlForNewTab,
  DEFAULT_BROWSER_TAB_URL,
  getBrowserTabLabel
} from './browserTabPolicy'
export type { BrowserTabLabelInput } from './browserTabPolicy'

export {
  applyBrowserPageViewportLayout,
  ensureBrowserPageViewport,
  getBrowserOverlaySlotViewport,
  getBrowserPageViewportContainer,
  parkBrowserPageViewport,
  registerBrowserOverlaySlotViewport,
  removeBrowserPageViewport,
  resetBrowserPageViewportsForTests,
  subscribeBrowserOverlaySlotViewport,
  syncBrowserPageChromeInset
} from './browserPageViewport'
export type { BrowserPageViewportLayout } from './browserPageViewport'
export { readBrowserNavigationState } from './browserNavigationState'
export type { BrowserNavigationState, BrowserNavigationTarget } from './browserNavigationState'
export { useBrowserPageSlotViewport } from './useBrowserPageSlotViewport'

export { loadBrowserPageWebviewUrl, reloadBrowserPageWebview } from './browserPageWebviewActions'
export type {
  BrowserPageWebviewActionResult,
  BrowserPageWebviewActionsPort
} from './browserPageWebviewActions'
export {
  addBrowserZoomEventListener,
  applyBrowserZoomToWebview,
  dispatchLocalBrowserZoom,
  registerBrowserZoomPersist,
  zoomBrowserWebview,
  BROWSER_ZOOM_MAX,
  BROWSER_ZOOM_MIN,
  BROWSER_ZOOM_STEP
} from './browserZoom'
export type { BrowserZoomDirection, BrowserZoomWebview } from './browserZoom'

export { BrowserNavButton } from './BrowserNavButton'
export type { BrowserNavHistoryEntry } from './BrowserNavButton'
export { BrowserDownloadsBar } from './BrowserDownloadsBar'
export type { BrowserOpenNewTabEvent, BrowserPaneHost } from './BrowserPaneHost'
export type { BrowserWebviewEventMap, BrowserWebviewPort } from './BrowserWebview'
export { BrowserContent } from './BrowserContent'
export { createBrowserPaneKind } from './browserPaneKind'
export type { BrowserPaneItem } from './BrowserPaneHost'
export { BrowserPaneOverlaySlot } from './BrowserPaneOverlaySlot'
export { browserPageGuestNeedsAttach, resolveBrowserPageWebview } from './browserPageGuestRecovery'
export type { GetPersistentBrowserWebview } from './browserPageGuestRecovery'
export { resolveOrphanWebviewPolicy, resolveWebviewPolicy } from './browserWebviewPolicy'
export type { WebviewPolicy, WebviewPolicyContext } from './browserWebviewPolicy'

export {
  applyBrowserDownloadEvent,
  getBrowserDownloads,
  getBrowserDownloadsForWebview,
  subscribeBrowserDownloads
} from './browserDownloads'
export type { BrowserDownloadEvent, BrowserDownloadItem } from './browserDownloads'
