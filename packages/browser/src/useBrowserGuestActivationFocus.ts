import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import type { BrowserPaneHost } from './BrowserPaneHost'
import type { BrowserWebviewPort } from './BrowserWebview'

const GUEST_FOCUS_FRAMES = 24

export function useBrowserGuestActivationFocus({
  host,
  isActive,
  workspaceTabId,
  paneTabItemId,
  webviewRef,
  keepAddressBarFocusRef,
  dragPassthroughActive,
  webviewReady = false
}: {
  host: Pick<
    BrowserPaneHost,
    | 'isGuestInteractive'
    | 'requestGuestFocus'
    | 'isGuestWebContentsFocused'
    | 'isWebviewHostFocused'
    | 'logFocus'
  >
  isActive: boolean
  workspaceTabId: number
  paneTabItemId: string
  webviewRef: RefObject<BrowserWebviewPort | null>
  keepAddressBarFocusRef: MutableRefObject<boolean>
  dragPassthroughActive: boolean
  webviewReady?: boolean
}): void {
  const focusedForActivationRef = useRef(false)
  const prevWebviewReadyRef = useRef(false)

  useEffect(() => {
    if (webviewReady && !prevWebviewReadyRef.current) focusedForActivationRef.current = false
    prevWebviewReadyRef.current = webviewReady
  }, [webviewReady])

  useEffect(() => {
    if (!isActive) {
      focusedForActivationRef.current = false
      return
    }
    if (focusedForActivationRef.current) return
    if (dragPassthroughActive) {
      host.logFocus('useBrowserGuestActivationFocus', 'skipped — drag passthrough')
      return
    }
    if (keepAddressBarFocusRef.current) {
      host.logFocus('useBrowserGuestActivationFocus', 'skipped — address bar grab')
      return
    }

    let cancelled = false
    let frameId = 0
    let attempts = 0

    const runFocus = (): void => {
      if (cancelled) return
      attempts += 1
      const webview = webviewRef.current
      if (!webview) {
        host.logFocus('useBrowserGuestActivationFocus', 'waiting for webview attach', {
          attempt: attempts
        })
        if (attempts < GUEST_FOCUS_FRAMES) frameId = window.requestAnimationFrame(runFocus)
        return
      }
      if (!host.isGuestInteractive(webview)) {
        host.logFocus('useBrowserGuestActivationFocus', 'waiting for guest interactive', {
          attempt: attempts
        })
        if (attempts < GUEST_FOCUS_FRAMES) frameId = window.requestAnimationFrame(runFocus)
        return
      }
      host.requestGuestFocus(workspaceTabId, paneTabItemId, `activation-attempt-${attempts}`)
      let guestFocused = false
      try {
        guestFocused = host.isGuestWebContentsFocused(webview.getWebContentsId())
      } catch {
        /* guest mid-teardown */
      }
      const hostFocused = host.isWebviewHostFocused(webview)
      if (guestFocused || hostFocused) {
        focusedForActivationRef.current = true
        host.logFocus('useBrowserGuestActivationFocus', 'activation focus complete', {
          attempt: attempts,
          guestFocused,
          hostFocused
        })
        return
      }
      if (attempts < GUEST_FOCUS_FRAMES) frameId = window.requestAnimationFrame(runFocus)
    }

    frameId = window.requestAnimationFrame(runFocus)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
    }
  }, [
    dragPassthroughActive,
    host,
    isActive,
    keepAddressBarFocusRef,
    paneTabItemId,
    webviewRef,
    webviewReady,
    workspaceTabId
  ])
}
