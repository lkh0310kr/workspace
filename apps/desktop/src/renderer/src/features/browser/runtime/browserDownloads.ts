import { applyBrowserDownloadEvent } from '@workspace/browser/browserDownloads'

export {
  getBrowserDownloads,
  getBrowserDownloadsForWebview,
  subscribeBrowserDownloads
} from '@workspace/browser/browserDownloads'

/** Desktop IPC adapter for the Browser-owned download state store. */
export function installBrowserDownloadRelay(): () => void {
  return window.api.browser.onDownloadEvent((payload) => applyBrowserDownloadEvent(payload))
}
