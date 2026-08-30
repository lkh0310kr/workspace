import { Actions, DockLocation, Model, TabNode } from "flexlayout-react";
import { layoutLog, layoutLogMutation, summarizeLayoutModel } from "./layoutDebugLog";
import { PaneGroupConfig, PaneTabItem, TabKind } from "./paneTypes";
import { getPaneKind, paneKindLabel } from "../panes/paneKindRegistry";
import { useWorkspaceStore } from "../store/workspaceStore";
import { findTabIdForModel } from "../store/workspaceLayoutModels";
import { resolveSplitPaneMutationStrategy } from "./layoutSplitPolicy";
import { createEmptyMarkdownTab, findReplaceableEditorTab } from "./paneTabSlots";

/** PaneGroup reads tabNode.getConfig() — bump revision only when the tab list
 * structure changes, not on activeTabId-only persists (that remounted
 * terminals/webviews on every tab click). */
function bumpPaneGroupRender(model: Model): void {
  const tabId = findTabIdForModel(model);
  if (tabId !== undefined) {
    useWorkspaceStore.getState().bumpLayoutRevision(tabId);
  }
}

// A simple incrementing counter here (as this used to be) resets to 1
// every time the renderer process starts — every tab/pane created that
// way in one session collides with same-kind tabs created early in any
// *other* session, since both start counting from 1. Two panes ending up
// with the literal same id (`code-1` in one workspace tab's persisted
// layout, `code-1` in another's) means their flexlayout node id
// (`tabgroup-${item.id}`) collides too — which silently merges anything
// keyed by that node id, e.g. PaneGroup.tsx's per-pane TreeView
// open/width state, reported as "TreeView state가 왜 다른 pane이랑 공유가
// 돼?". crypto.randomUUID() sidesteps the whole class of "reset every
// process start" collisions instead of just special-casing this one
// symptom.
function nextTabId(kind: TabKind): string {
  return `${kind}-${crypto.randomUUID()}`;
}

export async function buildTabItem(
  kind: TabKind,
  source?: Partial<PaneTabItem>,
  workspaceTabId?: number,
): Promise<PaneTabItem> {
  const id = nextTabId(kind);
  return getPaneKind(kind).createItem(id, source, workspaceTabId);
}

// The pane (flexlayout tab node) id must never be derived from the
// *first* tab item it happens to hold — a pane's own id outlives any
// single tab inside it (more tabs get added via addTabToGroup without
// ever changing the pane's id), so deriving it from `item.id` meant
// dragging that original founding tab out into its own new pane
// (moveTabToNewPane, below) tried to create a new node reusing the exact
// id the *source* pane (still alive, holding the remaining tabs) was
// already using — "each node must have a unique id, duplicate id:
// tabgroup-...", and the drag silently failed. A pane's id is its own
// identity, generated fresh every time a new pane is created, regardless
// of which item ends up inside it.
function tabGroupNodeJson(item: PaneTabItem) {
  const config: PaneGroupConfig = { tabs: [item], activeTabId: item.id };
  return {
    type: "tab" as const,
    id: `tabgroup-${crypto.randomUUID()}`,
    name: paneKindLabel(item.kind),
    component: "tabgroup" as const,
    config,
  };
}

function getGroupConfig(model: Model, tabNodeId: string): PaneGroupConfig | null {
  const node = model.getNodeById(tabNodeId);
  if (!(node instanceof TabNode)) return null;
  return (node.getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
}

/** flexlayout ADD_TAB only accepts tabset / row / border targets — not tab
 * node ids. Passing a tab id silently no-ops (pane vanishes on split). */
function resolveTabSetId(model: Model, tabNodeId: string): string | null {
  const node = model.getNodeById(tabNodeId);
  if (!(node instanceof TabNode)) return null;
  const parent = node.getParent();
  return parent?.getType() === "tabset" ? parent.getId() : null;
}

/** Adds a new pane (flexlayout tab node) to `tabSetId` holding a single
 * fresh tab of `kind` — used for "split" and for auto-filling an emptied
 * tabset with a default editor new-tab. */
export async function addPaneToTabSet(
  model: Model,
  tabSetId: string,
  kind: TabKind,
  source?: Partial<PaneTabItem>,
) {
  const before = summarizeLayoutModel(model);
  const workspaceTabId = findTabIdForModel(model);
  const item = await buildTabItem(kind, source, workspaceTabId);
  model.doAction(Actions.addTab(tabGroupNodeJson(item), tabSetId, DockLocation.CENTER, -1, true));
  layoutLogMutation("layoutActions.addPaneToTabSet", "added pane", before, summarizeLayoutModel(model), {
    tabSetId,
    kind,
    itemId: item.id,
  });
  bumpPaneGroupRender(model);
}

/** Adds a new tab of `kind` to an existing pane's tab group and makes it
 * active — the "globalized" version of what EditorPane's own openNewTab
 * used to do only for editor files. */
export async function addTabToGroup(
  model: Model,
  tabNodeId: string,
  kind: TabKind,
  source?: Partial<PaneTabItem>,
): Promise<string | null> {
  const before = summarizeLayoutModel(model);
  const config = getGroupConfig(model, tabNodeId);
  if (!config) {
    layoutLog("layoutActions.addTabToGroup", "missing pane", { tabNodeId, kind }, undefined);
    return null;
  }
  const workspaceTabId = findTabIdForModel(model);
  const item = await buildTabItem(kind, source, workspaceTabId);
  const next: PaneGroupConfig = { ...config, tabs: [...config.tabs, item], activeTabId: item.id };
  model.doAction(Actions.updateNodeAttributes(tabNodeId, { config: next }));
  layoutLogMutation("layoutActions.addTabToGroup", "added tab", before, summarizeLayoutModel(model), {
    tabNodeId,
    kind,
    itemId: item.id,
  });
  bumpPaneGroupRender(model);
  return item.id;
}

/** Open a workspace file in a pane group — reuses preview/empty "New tab"
 * slots instead of piling up tabs when possible. */
export async function openFileInPaneGroup(
  model: Model,
  tabNodeId: string,
  path: string,
  kind: "code" | "markdown" | "viewer",
  opts?: {
    jumpToLine?: number;
    pin?: boolean;
    isDirty?: (tabId: string) => boolean;
    onJumpToLine?: (tabId: string, line: number) => void;
  },
): Promise<string | null> {
  const config = getGroupConfig(model, tabNodeId);
  if (!config) return null;
  const isDirty = opts?.isDirty ?? (() => false);
  const existing = config.tabs.find((t) => t.filePath === path);
  if (existing) {
    if (opts?.pin && existing.isPreview) {
      updateTabInGroup(model, tabNodeId, existing.id, { isPreview: false });
    }
    if (opts?.jumpToLine != null) opts.onJumpToLine?.(existing.id, opts.jumpToLine);
    return existing.id;
  }
  const replaceable = !opts?.pin ? findReplaceableEditorTab(config.tabs, config.activeTabId, isDirty) : undefined;
  const open = replaceable
    ? replaceTabInGroup(model, tabNodeId, replaceable.id, kind, { filePath: path })
    : addTabToGroup(model, tabNodeId, kind, { filePath: path });
  const id = await open;
  if (!id) return null;
  if (!opts?.pin) updateTabInGroup(model, tabNodeId, id, { isPreview: true });
  if (opts?.jumpToLine != null) opts.onJumpToLine?.(id, opts.jumpToLine);
  return id;
}

export function setActiveTabInGroup(model: Model, tabNodeId: string, tabId: string): void {
  const config = getGroupConfig(model, tabNodeId);
  if (!config || config.activeTabId === tabId) return;
  layoutLog("layoutActions.setActiveTabInGroup", "active tab", { tabNodeId, tabId, from: config.activeTabId });
  model.doAction(Actions.updateNodeAttributes(tabNodeId, { config: { ...config, activeTabId: tabId } }));
}

/** Updates one tab item in place (e.g. a browser page's title/url after
 * navigation, an editor tab's filePath once a new file gets saved). */
export function updateTabInGroup(
  model: Model,
  tabNodeId: string,
  tabId: string,
  patch: Partial<PaneTabItem>,
): void {
  const config = getGroupConfig(model, tabNodeId);
  if (!config) return;
  const tabs = config.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t));
  model.doAction(Actions.updateNodeAttributes(tabNodeId, { config: { ...config, tabs } }));
}

/** Replaces one tab's kind in place (terminal ↔ browser ↔ editor, etc.).
 * Returns the new tab item's id, or null if the tab/node doesn't exist or
 * the kind is unchanged. */
export async function changeTabKindInGroup(
  model: Model,
  tabNodeId: string,
  tabId: string,
  kind: TabKind,
): Promise<string | null> {
  const config = getGroupConfig(model, tabNodeId);
  if (!config) return null;
  const idx = config.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return null;
  const existing = config.tabs[idx];
  if (existing.kind === kind) return tabId;

  let source: Partial<PaneTabItem> | undefined;
  if (kind === "browser" && existing.kind === "browser") {
    source = { url: existing.url };
  } else if (
    (kind === "code" || kind === "markdown") &&
    (existing.kind === "code" || existing.kind === "markdown")
  ) {
    source = { filePath: existing.filePath };
  }

  const workspaceTabId = findTabIdForModel(model);
  const item = await buildTabItem(kind, source, workspaceTabId);
  const tabs = [...config.tabs];
  tabs[idx] = item;
  const activeTabId = config.activeTabId === tabId ? item.id : config.activeTabId;
  model.doAction(Actions.updateNodeAttributes(tabNodeId, { config: { ...config, tabs, activeTabId } }));
  bumpPaneGroupRender(model);
  return item.id;
}

/** Replaces one tab's entire content in place (same array position — does
 * *not* move it to the end of the strip the way close+add would) — the
 * VSCode "preview tab" reuse case: clicking a different file in TreeView
 * while a clean (unedited) preview tab is open swaps that tab's content
 * instead of piling up a new one. Unlike changeTabKindInGroup, `source`
 * is the caller's, not derived from the old item — this is a full
 * replacement, not a same-file kind switch. Returns the new tab item's
 * id, or null if the tab/node doesn't exist. */
export async function replaceTabInGroup(
  model: Model,
  tabNodeId: string,
  oldTabId: string,
  kind: TabKind,
  source?: Partial<PaneTabItem>,
): Promise<string | null> {
  const config = getGroupConfig(model, tabNodeId);
  if (!config) return null;
  const idx = config.tabs.findIndex((t) => t.id === oldTabId);
  if (idx === -1) return null;
  const workspaceTabId = findTabIdForModel(model);
  const item = await buildTabItem(kind, source, workspaceTabId);
  const tabs = [...config.tabs];
  tabs[idx] = item;
  const activeTabId = config.activeTabId === oldTabId ? item.id : config.activeTabId;
  model.doAction(Actions.updateNodeAttributes(tabNodeId, { config: { ...config, tabs, activeTabId } }));
  bumpPaneGroupRender(model);
  return item.id;
}

/**
 * Moves a tab to `targetIndex` within `targetTabNodeId`'s tab group —
 * either reordering within the same pane (sourceTabNodeId ===
 * targetTabNodeId) or merging into a different pane's tab strip.
 * Synchronous (no spawning/async — the tab's terminal/webview already
 * exists, this only changes which pane node's config references it), so
 * PaneTabStrip.tsx can call it straight from a native `drop` handler.
 * Moving a pane's only tab elsewhere removes that now-empty pane (same as
 * closing it). Returns the moved tab's id, or null if either node/tab
 * doesn't exist.
 */
export function moveTabToGroup(
  model: Model,
  sourceTabNodeId: string,
  tabId: string,
  targetTabNodeId: string,
  targetIndex: number,
): string | null {
  const before = summarizeLayoutModel(model);
  const sourceConfig = getGroupConfig(model, sourceTabNodeId);
  if (!sourceConfig) {
    layoutLog("layoutActions.moveTabToGroup", "missing source pane", { sourceTabNodeId, tabId, targetTabNodeId });
    return null;
  }
  const item = sourceConfig.tabs.find((t) => t.id === tabId);
  if (!item) {
    layoutLog("layoutActions.moveTabToGroup", "missing tab", { sourceTabNodeId, tabId, targetTabNodeId });
    return null;
  }

  if (sourceTabNodeId === targetTabNodeId) {
    const withoutItem = sourceConfig.tabs.filter((t) => t.id !== tabId);
    const clamped = Math.max(0, Math.min(targetIndex, withoutItem.length));
    const tabs = [...withoutItem.slice(0, clamped), item, ...withoutItem.slice(clamped)];
    model.doAction(Actions.updateNodeAttributes(sourceTabNodeId, { config: { ...sourceConfig, tabs } }));
    layoutLogMutation("layoutActions.moveTabToGroup", "reordered tab", before, summarizeLayoutModel(model), {
      sourceTabNodeId,
      tabId,
      targetIndex: clamped,
    });
    bumpPaneGroupRender(model);
    return item.id;
  }

  const targetConfig = getGroupConfig(model, targetTabNodeId);
  if (!targetConfig) {
    layoutLog("layoutActions.moveTabToGroup", "missing target pane", { sourceTabNodeId, tabId, targetTabNodeId });
    return null;
  }

  const remainingSource = sourceConfig.tabs.filter((t) => t.id !== tabId);
  if (remainingSource.length === 0) {
    model.doAction(Actions.deleteTab(sourceTabNodeId));
  } else {
    const activeTabId = sourceConfig.activeTabId === tabId ? remainingSource[0].id : sourceConfig.activeTabId;
    model.doAction(
      Actions.updateNodeAttributes(sourceTabNodeId, {
        config: { ...sourceConfig, tabs: remainingSource, activeTabId },
      }),
    );
  }

  const clamped = Math.max(0, Math.min(targetIndex, targetConfig.tabs.length));
  const tabs = [...targetConfig.tabs.slice(0, clamped), item, ...targetConfig.tabs.slice(clamped)];
  model.doAction(
    Actions.updateNodeAttributes(targetTabNodeId, { config: { ...targetConfig, tabs, activeTabId: item.id } }),
  );
  layoutLogMutation("layoutActions.moveTabToGroup", "moved tab", before, summarizeLayoutModel(model), {
    sourceTabNodeId,
    tabId,
    targetTabNodeId,
    targetIndex,
    merged: sourceTabNodeId !== targetTabNodeId,
    sourceDeleted: remainingSource.length === 0,
  });
  bumpPaneGroupRender(model);
  return item.id;
}

/**
 * Dragging a tab and dropping it somewhere that ISN'T over any pane's tab
 * strip (no line-hint target) means "put this in a new layout position"
 * instead of reordering/merging — matches a real browser/VSCode: drop on
 * another tab strip to join it, drop elsewhere and it becomes its own
 * pane. Splits a new sibling pane off the source tabset (to its right) and
 * moves the tab into it. A pane's only tab has nowhere new to go (it's
 * already its own pane) — no-op, returns false.
 */
export function moveTabToNewPane(
  model: Model,
  sourceTabNodeId: string,
  tabId: string,
): { tabNodeId: string; tabItemId: string } | null {
  const sourceNode = model.getNodeById(sourceTabNodeId);
  if (!(sourceNode instanceof TabNode)) return null;
  return moveTabToSplitPane(model, sourceTabNodeId, tabId, sourceTabNodeId, DockLocation.RIGHT);
}

/** Removes a tab from its pane and docks a fresh single-tab pane relative
 * to `targetTabNodeId` (VS Code-style edge splits). Returns the new pane's
 * flexlayout node id and tab item id. */
export function moveTabToSplitPane(
  model: Model,
  sourceTabNodeId: string,
  tabId: string,
  targetTabNodeId: string,
  location: DockLocation,
): { tabNodeId: string; tabItemId: string } | null {
  const before = summarizeLayoutModel(model);
  const config = getGroupConfig(model, sourceTabNodeId);
  if (!config) {
    layoutLog("layoutActions.moveTabToSplitPane", "missing source pane", {
      sourceTabNodeId,
      tabId,
      targetTabNodeId,
      location: location.getName(),
    });
    return null;
  }
  const item = config.tabs.find((t) => t.id === tabId);
  if (!item) {
    layoutLog("layoutActions.moveTabToSplitPane", "missing tab", {
      sourceTabNodeId,
      tabId,
      targetTabNodeId,
      location: location.getName(),
    });
    return null;
  }
  const targetNode = model.getNodeById(targetTabNodeId);
  if (!(targetNode instanceof TabNode)) {
    layoutLog("layoutActions.moveTabToSplitPane", "invalid target node", {
      sourceTabNodeId,
      tabId,
      targetTabNodeId,
      location: location.getName(),
      targetType: targetNode?.getType(),
    });
    return null;
  }

  const remaining = config.tabs.filter((t) => t.id !== tabId);
  const nodeJson = tabGroupNodeJson(item);
  const samePane = sourceTabNodeId === targetTabNodeId;
  const emptySource = remaining.length === 0;
  const tabSetId = resolveTabSetId(model, targetTabNodeId);
  if (!tabSetId) {
    layoutLog("layoutActions.moveTabToSplitPane", "no tabset for target", {
      sourceTabNodeId,
      tabId,
      targetTabNodeId,
      location: location.getName(),
    });
    return null;
  }

  const removeFromSource = () => {
    if (emptySource) {
      model.doAction(Actions.deleteTab(sourceTabNodeId));
    } else {
      const activeTabId = config.activeTabId === tabId ? remaining[0].id : config.activeTabId;
      model.doAction(
        Actions.updateNodeAttributes(sourceTabNodeId, {
          config: { ...config, tabs: remaining, activeTabId },
        }),
      );
    }
  };

  // Same-pane splits must add the new tabset before mutating/deleting the
  // source tab node so flexlayout still has a valid anchor tabset.
  const strategy = resolveSplitPaneMutationStrategy(samePane, emptySource);

  if (samePane) {
    model.doAction(Actions.addTab(nodeJson, tabSetId, location, -1, true));
    removeFromSource();
  } else {
    removeFromSource();
    model.doAction(Actions.addTab(nodeJson, tabSetId, location, -1, true));
  }

  layoutLogMutation("layoutActions.moveTabToSplitPane", "split tab", before, summarizeLayoutModel(model), {
    sourceTabNodeId,
    tabId,
    targetTabNodeId,
    tabSetId,
    location: location.getName(),
    newPaneId: nodeJson.id,
    samePane,
    emptySource,
    strategy,
    tabKind: item.kind,
  });
  bumpPaneGroupRender(model);
  return { tabNodeId: nodeJson.id, tabItemId: item.id };
}

/** Closes the active tab in the currently-focused flexlayout pane (last tab
 * in a pane removes the pane itself). Returns whether anything was closed. */
export function closeActivePaneTab(model: Model): boolean {
  const tabset = model.getActiveTabset();
  const tabNode = tabset?.getSelectedNode();
  if (!tabNode || tabNode.getType() !== "tab") return false;
  const config = getGroupConfig(model, tabNode.getId());
  if (!config) return false;
  const activeId = config.activeTabId;
  if (!activeId || !config.tabs.some((t) => t.id === activeId)) return false;
  closeTabInGroup(model, tabNode.getId(), activeId);
  return true;
}

/** Closes one tab within the group; closing the last tab removes the pane
 * itself (matches a real browser: closing your only tab closes the
 * window). Returns the tab that's now active, or null if the whole pane
 * was removed. */
export function closeTabInGroup(model: Model, tabNodeId: string, tabId: string): string | null {
  const before = summarizeLayoutModel(model);
  const config = getGroupConfig(model, tabNodeId);
  if (!config) {
    layoutLog("layoutActions.closeTabInGroup", "missing pane", { tabNodeId, tabId });
    return null;
  }
  const idx = config.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return config.activeTabId;
  const tabs = config.tabs.filter((t) => t.id !== tabId);
  if (tabs.length === 0) {
    const fresh = createEmptyMarkdownTab();
    model.doAction(
      Actions.updateNodeAttributes(tabNodeId, {
        config: { ...config, tabs: [fresh], activeTabId: fresh.id },
      }),
    );
    layoutLogMutation(
      "layoutActions.closeTabInGroup",
      "reset pane to empty new tab",
      before,
      summarizeLayoutModel(model),
      { tabNodeId, tabId, nextTabId: fresh.id },
    );
    bumpPaneGroupRender(model);
    return fresh.id;
  }
  const activeTabId =
    config.activeTabId === tabId ? (tabs[idx] ?? tabs[idx - 1] ?? tabs[0]).id : config.activeTabId;
  model.doAction(Actions.updateNodeAttributes(tabNodeId, { config: { ...config, tabs, activeTabId } }));
  layoutLogMutation("layoutActions.closeTabInGroup", "closed tab", before, summarizeLayoutModel(model), {
    tabNodeId,
    tabId,
    nextActiveTabId: activeTabId,
  });
  bumpPaneGroupRender(model);
  return activeTabId;
}
