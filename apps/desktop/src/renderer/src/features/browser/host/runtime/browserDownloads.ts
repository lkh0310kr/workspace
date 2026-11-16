import { applyBrowserDownloadEvent } from '@workspace/browser/downloads'

export {
  getBrowserDownloads,
  getBrowserDownloadsForWebview,
  subscribeBrowserDownloads
} from '@workspace/browser/downloads'

/** Desktop IPC adapter for the Browser-owned download state store. */
export function installBrowserDownloadRelay(): () => void {
  return window.api.browser.onDownloadEvent((payload) => applyBrowserDownloadEvent(payload))
}
