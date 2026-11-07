import { useCallback, useSyncExternalStore } from "react";
import {
  getBrowserOverlaySlotViewport,
  subscribeBrowserOverlaySlotViewport,
} from "./browserPageViewport";

/** Imperative overlay slot root for a pane group's browser guests (Orca use-browser-page-slot-viewport). */
export function useBrowserPageSlotViewport(paneNodeId: string): HTMLDivElement | null {
  const subscribe = useCallback(
    (listener: () => void): (() => void) =>
      subscribeBrowserOverlaySlotViewport(paneNodeId, listener),
    [paneNodeId],
  );
  const getSnapshot = useCallback(
    () => getBrowserOverlaySlotViewport(paneNodeId),
    [paneNodeId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
