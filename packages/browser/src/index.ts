export { BrowserAddressBar } from './BrowserAddressBar'
export type { BrowserHistoryEntry } from './browserHistory'
export { getBrowserHistory, recordBrowserVisit } from './browserHistory'
export type { AddressBarSuggestion } from './browserAddressBarSuggestions'
export { buildAddressBarSuggestions } from './browserAddressBarSuggestions'
export { BLANK_URL, normalizeBrowserNavigationUrl } from './browserUrl'

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
