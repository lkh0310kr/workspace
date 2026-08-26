import type { DragEvent } from "react";
import type { ILayoutApi, TabNode } from "flexlayout-react";
import { layoutLog } from "./layoutDebugLog";
import { getTabDrag } from "./tabDrag";

type FlexLayoutController = {
  getDragDropManager: () => { onDragEnded: () => void };
};

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
const controllers = new Map<number, FlexLayoutController>();
let activeTabId: number | null = null;
let paneDragActive = false;

export function isPaneDragActive(): boolean {
  return paneDragActive;
}

const layoutRefCallbacks = new Map<number, (instance: ILayoutApi | null) => void>();

/** Stable ref callback — an inline `ref={(i) => setLayoutInstance(...)}` is a
 * new function every render, so React detaches/reattaches the Layout ref on
 * every App re-render (browser title/url/favicon updates, layout persist,
 * etc.). That churned controllers and made finishPaneDrag miss. */
export function getLayoutRefCallback(tabId: number): (instance: ILayoutApi | null) => void {
  let cb = layoutRefCallbacks.get(tabId);
  if (!cb) {
    cb = (instance: ILayoutApi | null) => setLayoutInstance(tabId, instance);
    layoutRefCallbacks.set(tabId, cb);
  }
  return cb;
}

export function setLayoutInstance(tabId: number, instance: ILayoutApi | null): void {
  if (instance) instances.set(tabId, instance);
  else instances.delete(tabId);
  layoutLog("layoutRef.setLayoutInstance", instance ? "attached" : "detached", {
    tabId,
    instanceCount: instances.size,
  }, tabId);
}

/** Captured from flexlayout's onRenderTabSet — not on the public Layout ref API. */
export function registerLayoutController(tabId: number, controller: FlexLayoutController | null): void {
  if (controller) controllers.set(tabId, controller);
  else controllers.delete(tabId);
}

/** flexlayout only wires dragend on its own hidden tab buttons, not our pane
 * strip — if we don't call this, showOverlay stays true and the invisible
 * flexlayout__layout_overlay eats every click in the layout area. */
export function finishPaneDrag(tabId: number | null = activeTabId): void {
  paneDragActive = false;
  if (tabId !== null) {
    const controller = controllers.get(tabId);
    if (controller) {
      layoutLog("layoutRef.finishPaneDrag", "onDragEnded", { tabId }, tabId);
      controller.getDragDropManager().onDragEnded();
    } else {
      layoutLog("layoutRef.finishPaneDrag", "no controller", { tabId }, tabId);
    }
  }
  // Belt: flexlayout's invisible drag overlay can outlive a missed onDragEnded
  // (Layout ref churn, webview swallowing dragend, etc.) and eat every click.
  document.querySelectorAll<HTMLElement>(".flexlayout__layout_overlay").forEach((el) => {
    el.style.display = "none";
  });
}

export function setActiveLayoutTab(tabId: number): void {
  layoutLog("layoutRef.setActiveLayoutTab", "active layout tab", { from: activeTabId, to: tabId }, tabId);
  activeTabId = tabId;
}

export function redrawAllLayouts(): void {
  for (const instance of instances.values()) {
    instance.redraw();
  }
}

export function startPaneDrag(event: DragEvent, node: TabNode): void {
  if (activeTabId === null) {
    layoutLog("layoutRef.startPaneDrag", "aborted — no active tab");
    return;
  }
  const layout = instances.get(activeTabId);
  if (!layout) {
    layoutLog("layoutRef.startPaneDrag", "aborted — no layout instance", { activeTabId }, activeTabId);
    return;
  }
  const native = event.nativeEvent;
  layoutLog("layoutRef.startPaneDrag", "begin pane drag", {
    paneNodeId: node.getId(),
    paneName: node.getName(),
    clientX: native.clientX,
    clientY: native.clientY,
  }, activeTabId);
  layout.moveTabWithDragAndDrop(native, node);
  paneDragActive = true;

  const root = document.querySelector<HTMLElement>(
    `.layout-host-item--active .flexlayout__layout`,
  );
  if (!root) {
    layoutLog("layoutRef.startPaneDrag", "no flexlayout root for synthetic dragover", undefined, activeTabId);
    return;
  }

  const dispatchToLayout = (type: "dragenter" | "dragover", clientX: number, clientY: number) => {
    root.dispatchEvent(
      new DragEvent(type, {
        // Must not bubble — a bubbling synthetic dragover reaches this same
        // window capture listener and re-enters forwardDragOver forever
        // ("row{tab,browser}에서 pane 드래그 후 전체 먹통").
        bubbles: false,
        cancelable: true,
        clientX,
        clientY,
      }),
    );
  };
  dispatchToLayout("dragenter", native.clientX, native.clientY);
  dispatchToLayout("dragover", native.clientX, native.clientY);

  // flexlayout only mounts its drop outline in onDragEnter. That event does
  // not fire when the drag starts inside the layout root — our pane tab
  // strips live inside flexlayout__tab — so seed enter/over above, then keep
  // forwarding dragover for the rest of the gesture.
  let forwarding = false;
  let forwardCount = 0;
  let cleaned = false;
  const forwardDragOver = (e: globalThis.DragEvent) => {
    if (!e.isTrusted || getTabDrag() || forwarding) return;
    forwarding = true;
    try {
      forwardCount++;
      dispatchToLayout("dragover", e.clientX, e.clientY);
    } finally {
      forwarding = false;
    }
  };
  const cleanup = (reason: string) => {
    if (cleaned) return;
    cleaned = true;
    paneDragActive = false;
    layoutLog("layoutRef.startPaneDrag", "pane drag cleanup", {
      reason,
      forwardCount,
      paneNodeId: node.getId(),
    }, activeTabId ?? undefined);
    finishPaneDrag(activeTabId);
    window.removeEventListener("dragover", forwardDragOver, true);
    window.removeEventListener("dragend", onDragEnd);
    window.removeEventListener("drop", onDrop);
    window.removeEventListener("mouseup", onMouseUp, true);
  };
  const onDragEnd = () => cleanup("dragend");
  const onDrop = () => cleanup("drop");
  const onMouseUp = () => cleanup("mouseup");
  window.addEventListener("dragover", forwardDragOver, true);
  window.addEventListener("dragend", onDragEnd);
  window.addEventListener("drop", onDrop);
  window.addEventListener("mouseup", onMouseUp, true);
}
