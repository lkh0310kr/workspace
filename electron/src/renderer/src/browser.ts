// Tauri's browser.ts wrapped a set of Rust commands (browser_report_frame,
// browser_hide_all, browser_cleanup_all, ...) that existed only because a
// native child WKWebView composites in its own OS layer, entirely outside
// normal DOM stacking — so drag overlays, splitter handles, and tab
// switches all needed an explicit "hide every native view" escape hatch.
// Electron's <webview> guest (see components/BrowserPane.tsx) composites
// within the regular DOM stacking order instead, which is the whole reason
// it was chosen over a BrowserView here — so that entire problem class,
// and the IPC surface built to work around it, doesn't apply. Kept as
// no-op stubs (rather than stripped from every call site) so
// overlayBarrier.ts and WorkspaceTabRail.tsx can be ported unchanged.
export async function browserHideAll(): Promise<void> {}

export async function browserCleanupAll(): Promise<void> {}
