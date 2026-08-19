import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BrowserRect } from "../browser";

export async function cefReportFrame(
  paneId: string,
  url: string,
  rect: BrowserRect,
  visible: boolean,
): Promise<void> {
  return invoke("cef_report_frame", {
    paneId,
    url,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    visible,
  });
}

export async function cefNavigate(paneId: string, url: string): Promise<void> {
  return invoke("cef_navigate", { paneId, url });
}

export async function cefBack(paneId: string): Promise<void> {
  return invoke("cef_back", { paneId });
}

export async function cefForward(paneId: string): Promise<void> {
  return invoke("cef_forward", { paneId });
}

export async function cefReload(paneId: string): Promise<void> {
  return invoke("cef_reload", { paneId });
}

export async function cefToggleDevtools(paneId: string): Promise<void> {
  return invoke("cef_toggle_devtools", { paneId });
}

export async function cefClosePane(paneId: string): Promise<void> {
  return invoke("cef_close_pane", { paneId });
}

/// Hides a pane's native view without destroying it — use this for
/// "the pane just unmounted because its tab isn't showing right now", not
/// `cefClosePane` (destroying the browser from that path was observed to
/// crash the whole app natively). `cefCleanupAll` reaps abandoned panes.
export async function cefHidePane(paneId: string): Promise<void> {
  return invoke("cef_hide_pane", { paneId });
}

export async function cefHideAll(): Promise<void> {
  return invoke("cef_hide_all");
}

export async function cefCleanupAll(): Promise<void> {
  return invoke("cef_cleanup_all");
}

export interface CefLoadingPayload {
  paneId: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export function onCefLoading(handler: (payload: CefLoadingPayload) => void) {
  return listen<CefLoadingPayload>("cef-loading", (e) => handler(e.payload));
}

export interface CefAddressPayload {
  paneId: string;
  url: string;
}

/// Fires on every navigation *and* in-page URL change the site itself
/// makes (client-side routing, following a link) — this is what keeps the
/// toolbar honest after the user clicks something inside the page, not
/// just after our own `cefNavigate`.
export function onCefAddress(handler: (payload: CefAddressPayload) => void) {
  return listen<CefAddressPayload>("cef-address", (e) => handler(e.payload));
}

export interface CefProgressPayload {
  paneId: string;
  progress: number;
}

/// Real 0.0-1.0 main-frame load progress (same signal a real browser's
/// address-bar progress indicator uses) — unlike `isLoading` in
/// `CefLoadingPayload`, this isn't thrown off by a page's background
/// requests that keep it "loading" forever after it's usably done.
export function onCefProgress(handler: (payload: CefProgressPayload) => void) {
  return listen<CefProgressPayload>("cef-progress", (e) => handler(e.payload));
}
