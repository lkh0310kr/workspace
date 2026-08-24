// Tracks whichever <webview> is currently the "active" browser tab, so
// the global Cmd+R/Cmd+Shift+R handler (App.tsx) knows which one to
// reload — there's no single always-focused webview to ask directly
// (multiple browser tabs can exist across different panes/splits), so
// BrowserContent.tsx registers itself here whenever it becomes visible.
// Same module-level-variable pattern as tabDrag.ts/layoutRef.ts for
// bridging between sibling component instances.
let current: Electron.WebviewTag | null = null;

export function setActiveBrowserWebview(webview: Electron.WebviewTag | null): void {
  current = webview;
}

export function getActiveBrowserWebview(): Electron.WebviewTag | null {
  return current;
}
