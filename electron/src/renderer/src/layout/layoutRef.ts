import type { DragEvent } from "react";
import type { ILayoutApi, TabNode } from "flexlayout-react";

/**
 * `flexlayout-react`'s built-in drag-to-reposition (`moveTabWithDragAndDrop`)
 * is a public method on the `Layout` component instance, meant to be called
 * from a custom drag-start handler. We don't use flexlayout's own tab strip
 * (hidden app-wide — `PaneFrame`'s header is our own), so this module holds
 * a ref back to it that `PaneFrame`'s header, nested arbitrarily deep under
 * whichever pane component owns it, can reach without prop-drilling through
 * every pane component. Same pattern as `browser/overlayBarrier.ts`.
 *
 * Every workspace tab's <Layout> is mounted simultaneously now (App.tsx
 * keeps them all alive, visibility-toggled instead of remounting on
 * switch), so this needs one instance *per tab*, not a single shared ref —
 * a previous version conditionally attached/detached one shared ref
 * (`ref={active ? setLayoutInstance : undefined}`), which raced: React
 * processes each array element's ref change independently, in whatever
 * order they appear in the tabs array, not "detach the old one before
 * attaching the new one" — if the newly-active tab happened to come before
 * the newly-inactive one in that array, its attach ran first and the old
 * tab's *cleanup* (setting the ref to null) then ran second, silently
 * clobbering it back to null. moveTabWithDragAndDrop calls on a null ref
 * are a silent no-op — reported as "layout 수정 모드일때 placeholder box가
 * 안 떠" (dragging a pane did nothing at all, no error). Keying by tab id
 * (always attached/detached, never conditional) and tracking which tab is
 * active as separate state removes that ordering dependency entirely.
 */
const instances = new Map<number, ILayoutApi>();
let activeTabId: number | null = null;

export function setLayoutInstance(tabId: number, instance: ILayoutApi | null): void {
  if (instance) instances.set(tabId, instance);
  else instances.delete(tabId);
}

export function setActiveLayoutTab(tabId: number): void {
  activeTabId = tabId;
}

export function redrawAllLayouts(): void {
  for (const instance of instances.values()) {
    instance.redraw();
  }
}

export function startPaneDrag(event: DragEvent, node: TabNode): void {
  if (activeTabId === null) return;
  instances.get(activeTabId)?.moveTabWithDragAndDrop(event.nativeEvent, node);
}
