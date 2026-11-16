/** Browser guest snapshots used by Browser focus logs and the app diagnostics panel. */
export function collectBrowserWebviews(): Array<Record<string, unknown>> {
  return [...document.querySelectorAll('webview')].map((element) => {
    const webview = element as Electron.WebviewTag
    const style = window.getComputedStyle(webview)
    const host = webview.closest('[data-workspace-tab-id]')
    return {
      tabItemId: webview.dataset.tabItemId ?? '',
      workspaceTabId: host?.getAttribute('data-workspace-tab-id') ?? '',
      inlinePointerEvents: webview.style.pointerEvents,
      computedPointerEvents: style.pointerEvents,
      visibility: style.visibility,
      display: style.display,
      url: (() => {
        try {
          return webview.getURL()
        } catch {
          return '?'
        }
      })()
    }
  })
}
