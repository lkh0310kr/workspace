import type { DragEvent } from "react";
import type { ILayoutApi, TabNode } from "flexlayout-react";

/**
 * `flexlayout-react`'s built-in drag-to-reposition (`moveTabWithDragAndDrop`)
 * is a public method on the `Layout` component instance, meant to be called
 * from a custom drag-start handler. We don't use flexlayout's own tab strip
 * (hidden app-wide — `PaneFrame`'s header is our own), so this module-scope
 * ref is how `PaneFrame`'s header, nested arbitrarily deep under whichever
 * pane component owns it, reaches back up to the single `Layout` instance
 * without prop-drilling through every pane component. Same pattern as
 * `browser/overlayBarrier.ts`.
 */
let layoutInstance: ILayoutApi | null = null;

export function setLayoutInstance(instance: ILayoutApi | null): void {
  layoutInstance = instance;
}

export function startPaneDrag(event: DragEvent, node: TabNode): void {
  layoutInstance?.moveTabWithDragAndDrop(event.nativeEvent, node);
}
