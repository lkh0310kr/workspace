export interface BrowserNavHistoryEntry {
  url: string;
  title: string;
}

export async function fetchWebviewNavHistory(webContentsId: number): Promise<{
  entries: BrowserNavHistoryEntry[];
  activeIndex: number;
} | null> {
  return window.api.browser.getNavHistory(webContentsId);
}

export function goToWebviewHistoryIndex(webview: Electron.WebviewTag, index: number): void {
  try {
    webview.goToIndex(index);
  } catch {
    // webview may be mid-teardown.
  }
}
