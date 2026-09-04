import type { PaneTabItem } from "./paneTypes";

/** Editor/viewer tab with no file bound yet — the strip shows "New tab". */
export function isEmptyEditorTab(item: PaneTabItem): boolean {
  if (item.kind !== "code" && item.kind !== "markdown" && item.kind !== "viewer") return false;
  return !item.filePath && !item.absolutePath;
}

/** Preview tabs and empty editor tabs are single-use slots for the next open. */
export function isReplaceableEditorSlot(item: PaneTabItem): boolean {
  return item.isPreview === true || isEmptyEditorTab(item);
}

export function findReplaceableEditorTab(
  tabs: PaneTabItem[],
  activeTabId: string,
  isDirty: (tabId: string) => boolean,
): PaneTabItem | undefined {
  const canReplace = (tab: PaneTabItem) => isReplaceableEditorSlot(tab) && !isDirty(tab.id);
  const active = tabs.find((t) => t.id === activeTabId);
  if (active && canReplace(active)) return active;
  const preview = tabs.find((t) => t.isPreview && !isDirty(t.id));
  if (preview) return preview;
  return tabs.find((t) => isEmptyEditorTab(t) && !isDirty(t.id));
}

export function createEmptyMarkdownTab(): PaneTabItem {
  return { id: `markdown-${crypto.randomUUID()}`, kind: "markdown", filePath: null };
}
