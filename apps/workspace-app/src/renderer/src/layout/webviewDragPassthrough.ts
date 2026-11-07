/** Pointer passthrough for Electron guests held open across a renderer-owned drag.
 *
 * Every surface that can swallow the document pointer stream enrols here so one
 * acquire covers all of them. Acquires are reference counted: overlapping drags
 * (a pane tab drag started while another is still settling) must not let the
 * first release turn passthrough off under the second.
 */

/** Called with the passthrough state whenever it changes. */
export type WebviewDragPassthroughSurface = (passthrough: boolean) => void;

const passthroughTokens = new Set<symbol>();
const passthroughSurfaces = new Set<WebviewDragPassthroughSurface>();

export function isWebviewDragPassthroughActive(): boolean {
  return passthroughTokens.size > 0;
}

export function registerWebviewDragPassthroughSurface(
  surface: WebviewDragPassthroughSurface,
): () => void {
  passthroughSurfaces.add(surface);
  return () => {
    passthroughSurfaces.delete(surface);
  };
}

function notifyWebviewDragPassthroughSurfaces(): void {
  const passthrough = isWebviewDragPassthroughActive();
  // Copied: a surface may enrol or drop out while being notified.
  const notified = Array.from(passthroughSurfaces);
  for (const surface of notified) {
    surface(passthrough);
  }
}

export function acquireWebviewsDragPassthrough(): () => void {
  // Why: a native HTML5 drag (flexlayout tab-node move, PaneTabStrip chip
  // drag) can still let an Electron guest steal the pointer stream mid-drag
  // unless it is temporarily made non-interactive.
  const token = Symbol("webview-drag-passthrough");
  let released = false;
  passthroughTokens.add(token);
  notifyWebviewDragPassthroughSurfaces();

  return () => {
    if (released) {
      return;
    }
    released = true;
    passthroughTokens.delete(token);
    notifyWebviewDragPassthroughSurfaces();
  };
}
