import type { Model } from "flexlayout-react";

/**
 * flexlayout Model instances and layout-side ephemeral state.
 * Lives outside zustand reactive tree — use workspaceStore actions to mutate.
 */
const modelsByTabId = new Map<number, Model>();
const savedLayoutJsonByTabId = new Map<number, string>();
const ensureInflightTabIds = new Set<number>();
const pendingRebalanceByTabId = new Map<number, string | null>();

export function getLayoutModel(tabId: number): Model | undefined {
  return modelsByTabId.get(tabId);
}

export function setLayoutModel(tabId: number, model: Model): void {
  modelsByTabId.set(tabId, model);
}

export function deleteLayoutModel(tabId: number): void {
  modelsByTabId.delete(tabId);
  savedLayoutJsonByTabId.delete(tabId);
  pendingRebalanceByTabId.delete(tabId);
  ensureInflightTabIds.delete(tabId);
}

export function layoutModelTabIds(): Iterable<number> {
  return modelsByTabId.keys();
}

export function getSavedLayoutJson(tabId: number): string | undefined {
  return savedLayoutJsonByTabId.get(tabId);
}

export function setSavedLayoutJson(tabId: number, json: string): void {
  savedLayoutJsonByTabId.set(tabId, json);
}

export function markEnsureInflight(tabId: number): boolean {
  if (ensureInflightTabIds.has(tabId)) return false;
  ensureInflightTabIds.add(tabId);
  return true;
}

export function clearEnsureInflight(tabId: number): void {
  ensureInflightTabIds.delete(tabId);
}

export function setPendingRebalance(tabId: number, nodeId: string | null): void {
  pendingRebalanceByTabId.set(tabId, nodeId);
}

export function takePendingRebalance(tabId: number): string | null | undefined {
  const draggedId = pendingRebalanceByTabId.get(tabId);
  if (draggedId !== undefined) {
    pendingRebalanceByTabId.set(tabId, null);
  }
  return draggedId;
}
