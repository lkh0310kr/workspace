import { browserHideAll } from "../browser";
import { cefHideAll } from "./cefBrowser";

/**
 * Native child views (WKWebView panes *and* windowed CEF panes) always
 * render above the DOM (separate OS compositing layer), so any UI meant to
 * sit visually above them — dropdowns, split drag handles — gets covered.
 * Instead of fighting z-order, hide every visible native pane while such UI
 * is open, then let subscribers (browser/CEF panes) re-sync their frame
 * once it closes.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let blockCount = 0;

export function isOverlayBlocked(): boolean {
  return blockCount > 0;
}

export function subscribeOverlayBarrier(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pushOverlayBlock(): void {
  blockCount += 1;
  if (blockCount === 1) {
    void browserHideAll().catch(console.error);
    void cefHideAll().catch(console.error);
  }
}

export function popOverlayBlock(): void {
  blockCount = Math.max(0, blockCount - 1);
  if (blockCount === 0) {
    for (const listener of listeners) listener();
  }
}
