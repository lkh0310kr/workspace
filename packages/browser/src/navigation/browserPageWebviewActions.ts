/** Ported from ref-proj/orca browser-reload-action.ts */
import type { BrowserWebviewPort } from '../pane/BrowserWebview'

export type BrowserPageWebviewActionResult = 'ok' | 'guest-missing' | 'not-ready'

export type BrowserPageWebviewActionsPort = Pick<
  BrowserWebviewPort,
  'getWebContentsId' | 'reload' | 'reloadIgnoringCache' | 'loadURL'
>

function probeWebviewGuest(webview: BrowserPageWebviewActionsPort): boolean {
  try {
    webview.getWebContentsId()
    return true
  } catch {
    return false
  }
}

export function reloadBrowserPageWebview(
  webview: BrowserPageWebviewActionsPort,
  { ignoreCache }: { ignoreCache: boolean }
): BrowserPageWebviewActionResult {
  if (!probeWebviewGuest(webview)) {
    return 'guest-missing'
  }
  try {
    if (ignoreCache) {
      webview.reloadIgnoringCache()
    } else {
      webview.reload()
    }
  } catch {
    return probeWebviewGuest(webview) ? 'not-ready' : 'guest-missing'
  }
  return 'ok'
}

export function loadBrowserPageWebviewUrl(
  webview: BrowserPageWebviewActionsPort,
  url: string
): BrowserPageWebviewActionResult {
  if (!probeWebviewGuest(webview)) {
    return 'guest-missing'
  }
  try {
    void webview.loadURL(url).catch(() => {
      /* did-fail-load owns navigation errors */
    })
  } catch {
    return probeWebviewGuest(webview) ? 'not-ready' : 'guest-missing'
  }
  return 'ok'
}
