// Must match main/browserSession.ts's BROWSER_SESSION_PARTITION — kept as a
// separate constant (not imported across the main/renderer boundary, which
// isn't bundled together) so BrowserPane.tsx's <webview> actually lands in
// the session the main process configured (UA, permissions, WebAuthn
// handlers) instead of Electron's unconfigured default session.
export const BROWSER_SESSION_PARTITION = "persist:browser";
