// Tracks whichever <webview> currently has real DOM focus, so the global
// Cmd+R/Cmd+Shift+R handler (App.tsx) knows which one to reload — multiple
// browser tabs can exist across different panes/splits simultaneously, and
// only one pane's content can genuinely be focused at a time.
//
// Two signals feed this, both needed:
//   1. BrowserContent.tsx calls webview.focus() when its tab becomes the
//      selected/visible one (mirroring what TerminalPane.tsx/EditorContent
//      already do on their own "active" transition) — without this,
//      switching to a browser tab without also manually clicking into the
//      page never moved real focus there, so this stayed stale/empty.
//   2. installBrowserFocusTracking() (called once from App.tsx) clears it
//      whenever focus lands anywhere outside a browser pane's own chrome —
//      a <webview>'s guest content is a separate process, so its own
//      focus/blur *does* dispatch directly on the element (BrowserContent
//      listens for that), but that doesn't help when the user instead
//      clicks into a sibling pane's terminal/editor in a different split:
//      that's an ordinary in-document focus move, which a single
//      document-level 'focusin' listener here catches uniformly instead of
//      wiring every other pane content type to clear this individually.
let current: Electron.WebviewTag | null = null;

export function setActiveBrowserWebview(webview: Electron.WebviewTag | null): void {
  current = webview;
}

export function getActiveBrowserWebview(): Electron.WebviewTag | null {
  return current;
}

export function installBrowserFocusTracking(): () => void {
  const onFocusIn = (e: FocusEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target?.closest(".browser-pane-chrome")) return;
    current = null;
  };
  document.addEventListener("focusin", onFocusIn);
  return () => document.removeEventListener("focusin", onFocusIn);
}
