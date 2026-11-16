import {
  getActiveBrowserWebview,
  getBrowserWebviewByWebContentsId,
  installBrowserFocusTracking,
  installBrowserGuestFocusRelay
} from '../layout/activeBrowserWebview'
import { onBrowserZoomShortcut } from '../electron'
import { addBrowserZoomEventListener, zoomBrowserWebview } from '@workspace/browser'
import { getBrowserFocusLogRing } from './browserFocusDebugLog'
import { reloadBrowserPageWebview } from '@workspace/browser'
import { isDevInstrumentation } from '../debug/devTools'

/** One-shot setup for browser guest focus tracking (Cmd+R target, etc.). */
export function installBrowserEmbedSupport(): () => void {
  const unlistenFocus = installBrowserFocusTracking()
  const unlistenGuest = installBrowserGuestFocusRelay()
  const unlistenZoom = onBrowserZoomShortcut(({ direction, webContentsId }) => {
    zoomBrowserWebview(direction, webContentsId, (id) =>
      id != null
        ? (getBrowserWebviewByWebContentsId(id) ?? getActiveBrowserWebview())
        : getActiveBrowserWebview()
    )
  })
  const removeLocalZoom = addBrowserZoomEventListener(({ direction }) => {
    zoomBrowserWebview(direction, undefined, () => getActiveBrowserWebview())
  })
  if (isDevInstrumentation && typeof window !== 'undefined') {
    const win = window as Window & {
      __browserFocusLog?: () => readonly unknown[]
      __browserFocusLogPath?: string
    }
    win.__browserFocusLog = () => getBrowserFocusLogRing()
    win.__browserFocusLogPath =
      'Desktop application data/logs/interaction.ndjson (legacy profile directory)'
  }
  return () => {
    unlistenFocus()
    unlistenGuest()
    unlistenZoom()
    removeLocalZoom()
  }
}

export function reloadFocusedBrowser(hard: boolean): void {
  const webview = getActiveBrowserWebview()
  if (!webview) return
  reloadBrowserPageWebview(webview, { ignoreCache: hard })
}
