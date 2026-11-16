import { useEffect } from 'react'
import { installBrowserDownloadRelay, installBrowserEmbedSupport } from './runtime'
import { onBrowserReloadShortcut } from './runtime/browserIpc'
import { reloadFocusedBrowser } from './runtime'

export function useBrowserRuntimeBootstrap(): void {
  useEffect(() => installBrowserEmbedSupport(), [])
  useEffect(() => installBrowserDownloadRelay(), [])
}

export function useBrowserReloadShortcutBootstrap(): void {
  useEffect(() => onBrowserReloadShortcut(({ hard }) => reloadFocusedBrowser(hard)), [])
}
