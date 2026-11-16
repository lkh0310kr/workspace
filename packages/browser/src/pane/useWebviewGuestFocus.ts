import { useMemo, type RefObject } from 'react'
import type { BrowserPaneHost } from './BrowserPaneHost'
import type { BrowserWebviewPort } from './BrowserWebview'

/** How browser chrome hands focus to the <webview> guest (Orca browser-page-guest-focus). */
export type WebviewGuestFocus = {
  blur: () => void
  focus: (reason?: string) => boolean
  isAttached: () => boolean
}

export function useWebviewGuestFocus(
  webviewRef: RefObject<BrowserWebviewPort | null>,
  host: Pick<BrowserPaneHost, 'focusGuest' | 'isWebviewHostFocused' | 'logFocus'>
): WebviewGuestFocus {
  return useMemo(
    () => ({
      blur: () => {
        host.logFocus('useWebviewGuestFocus.blur', 'blur guest host')
        webviewRef.current?.blur()
      },
      isAttached: () => webviewRef.current !== null,
      focus: (reason = 'unknown') => {
        const webview = webviewRef.current
        if (!webview) {
          host.logFocus('useWebviewGuestFocus.focus', 'no webview ref', { reason })
          return false
        }
        host.focusGuest(webview, reason)
        const ok = host.isWebviewHostFocused(webview)
        host.logFocus('useWebviewGuestFocus.focus', ok ? 'focused' : 'focus incomplete', {
          reason,
          tabItemId: webview.dataset.tabItemId
        })
        return ok
      }
    }),
    [webviewRef, host]
  )
}
