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

export async function goToWebviewHistoryIndex(webContentsId: number, index: number): Promise<void> {
  try {
    await window.api.browser.goToIndex(webContentsId, index);
  } catch {
    // guest may be mid-teardown.
  }
}
