// Tracks whichever <webview> currently has real DOM focus, so the global
// Cmd+R/Cmd+Shift+R handler (App.tsx) knows which one to reload —
// multiple browser tabs can exist across different panes/splits
// simultaneously, and only one pane's webview can genuinely be focused at
// a time. BrowserContent.tsx registers/clears itself via the webview's own
// focus/blur DOM events (and also clears on tab-switch-away, since a
// hidden-but-still-mounted webview doesn't get a real blur event). Same
// module-level-variable pattern as tabDrag.ts/layoutRef.ts for bridging
// between sibling component instances.
let current: Electron.WebviewTag | null = null;

export function setActiveBrowserWebview(webview: Electron.WebviewTag | null): void {
  current = webview;
}

export function getActiveBrowserWebview(): Electron.WebviewTag | null {
  return current;
}
