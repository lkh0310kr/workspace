export interface BrowserNavigationTarget {
  isConnected: boolean;
  canGoBack(): boolean;
  canGoForward(): boolean;
}

export interface BrowserNavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
}

const UNAVAILABLE: BrowserNavigationState = { canGoBack: false, canGoForward: false };

export function readBrowserNavigationState(
  target: BrowserNavigationTarget | null,
  domReady: boolean,
): BrowserNavigationState {
  if (!target || !domReady || !target.isConnected) return UNAVAILABLE;

  try {
    return {
      canGoBack: target.canGoBack(),
      canGoForward: target.canGoForward(),
    };
  } catch {
    // Electron can detach a <webview> between a navigation event and this read.
    return UNAVAILABLE;
  }
}
