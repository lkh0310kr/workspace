import { browserHideAll } from "../browser";

/**
 * Native child views (WKWebView panes) always render above the DOM
 * (separate OS compositing layer), so any UI meant to sit visually above
 * them — dropdowns, split drag handles — gets covered. Instead of
 * fighting z-order, hide every visible native pane while such UI is open,
 * then let subscribers (browser panes) re-sync their frame once it closes.
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
  }
}

export function popOverlayBlock(): void {
  blockCount = Math.max(0, blockCount - 1);
  if (blockCount === 0) {
    for (const listener of listeners) listener();
  }
}

// Safety net for a block that never gets popped: every push is paired
// with a real mouse button currently held down (splitter drag, pane-tab
// drag via flexlayout's HTML5 DnD), and by spec `dragend` should always
// fire once that button is released regardless of the drop target — but
// WebKit has known cases where it doesn't (a release over a *native*
// child view, e.g. a Browser pane's WKWebView, isn't part of the DOM's
// own drag protocol at all). When that happens here, blockCount is stuck
// above 0 forever: browser panes stay hidden and never resync — one
// concrete, previously-unaccounted-for way "pane drag suddenly stops
// working" could actually manifest. A capture-phase mouseup anywhere is a
// reasonable "the button is definitely up now" signal independent of
// whether any drag-specific event fired at all, so force-clear here
// too — legitimate concurrent blocks are always momentary and tied to a
// currently-held button, so there's no real block still "in progress" by
// the time any mouseup reaches this listener.
if (typeof window !== "undefined") {
  window.addEventListener(
    "mouseup",
    () => {
      if (blockCount === 0) return;
      blockCount = 0;
      for (const listener of listeners) listener();
    },
    true,
  );
}
