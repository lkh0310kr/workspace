import { session } from "electron";
import { setupBrowserSessionUA } from "./browserSessionUA";
import { installBrowserWebAuthnAccessHandlers, allowsBrowserWebAuthnPermission } from "./browserWebauthn";

export const BROWSER_SESSION_PARTITION = "persist:browser";

// Web features that are safe to auto-grant without a per-site prompt UI
// (which this app has no way to show) — ported from Orca's
// AUTO_GRANTED_BROWSER_PERMISSIONS, dropping the clipboard/CDP-automation
// grants that only make sense for Orca's agent-driven browser commands.
const AUTO_GRANTED_PERMISSIONS = new Set([
  "fullscreen",
  "notifications",
  // Chromium can request this even though Electron's TS union omits it;
  // some sites use it to keep browser storage from eviction.
  "persistent-storage",
  "pointerLock",
]);

// Sets up the shared browser-pane session partition once at startup:
// a Chrome-shaped (Google-auth-aware) User-Agent, an auto-grant policy for
// low-risk permissions, and the WebAuthn/passkey handlers a `<webview>`
// needs for Google sign-in to actually work (see browserSessionUA.ts and
// browserWebauthn.ts for why each piece exists). Must run before any
// BrowserPane webview navigates — called from app.whenReady(), and
// BrowserPane.tsx sets partition={BROWSER_SESSION_PARTITION} on its
// <webview> so it actually uses this session rather than the app's
// unconfigured default one.
export function setupBrowserSession(): void {
  const sess = session.fromPartition(BROWSER_SESSION_PARTITION);
  setupBrowserSessionUA(sess);
  installBrowserWebAuthnAccessHandlers(sess);

  sess.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(AUTO_GRANTED_PERMISSIONS.has(permission));
  });
  sess.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
    if (allowsBrowserWebAuthnPermission(permission, details)) return true;
    return AUTO_GRANTED_PERMISSIONS.has(permission);
  });
}
