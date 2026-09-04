import { useSyncExternalStore } from "react";
import {
  isWebviewDragPassthroughActive,
  registerWebviewDragPassthroughSurface,
} from "../layout/webviewDragPassthrough";

function subscribe(onStoreChange: () => void): () => void {
  return registerWebviewDragPassthroughSurface(onStoreChange);
}

/** True while a renderer-owned drag holds browser guests click-through (Orca pattern). */
export function useWebviewDragPassthroughActive(): boolean {
  return useSyncExternalStore(subscribe, isWebviewDragPassthroughActive, () => false);
}
