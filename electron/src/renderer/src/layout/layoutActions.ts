import { Actions, DockLocation, Model, TabNode } from "flexlayout-react";
import { spawnTerminal } from "../electron";
import { PaneGroupConfig, PaneTabItem, TabKind, tabKindLabel } from "./paneTypes";

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

export async function buildTabItem(kind: TabKind, source?: Partial<PaneTabItem>): Promise<PaneTabItem> {
  const id = nextTabId(kind);
  switch (kind) {
    case "terminal":
      return { id, kind, terminalId: await spawnTerminal() };
    case "browser":
      return { id, kind, url: source?.url ?? "https://www.google.com" };
    case "code":
    case "markdown":
      return { id, kind, filePath: source?.filePath ?? null };
    default:
      return { id, kind };
  }
}

function tabGroupNodeJson(item: PaneTabItem) {
  const config: PaneGroupConfig = { tabs: [item], activeTabId: item.id };
  return {
    type: "tab" as const,
    id: `tabgroup-${item.id}`,
    name: tabKindLabel(item.kind),
    component: "tabgroup" as const,
    config,
  };
}

function getGroupConfig(model: Model, tabNodeId: string): PaneGroupConfig | null {
  const node = model.getNodeById(tabNodeId);
  if (!(node instanceof TabNode)) return null;
  return (node.getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
}

/** Adds a new pane (flexlayout tab node) to `tabSetId` holding a single
 * fresh tab of `kind` — used for "split" and for auto-filling an emptied
 * tabset with a default terminal. */
export async function addPaneToTabSet(
  model: Model,
  tabSetId: string,
  kind: TabKind,
  source?: Partial<PaneTabItem>,
) {
  const item = await buildTabItem(kind, source);
  model.doAction(Actions.addNode(tabGroupNodeJson(item), tabSetId, DockLocation.CENTER, -1, true));
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
  const config = getGroupConfig(model, tabNodeId);
  if (!config) return null;
  const item = await buildTabItem(kind, source);
  const next: PaneGroupConfig = { ...config, tabs: [...config.tabs, item], activeTabId: item.id };
  model.doAction(Actions.updateNodeAttributes(tabNodeId, { config: next }));
  return item.id;
}

export function setActiveTabInGroup(model: Model, tabNodeId: string, tabId: string): void {
  const config = getGroupConfig(model, tabNodeId);
  if (!config || config.activeTabId === tabId) return;
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
  const sourceConfig = getGroupConfig(model, sourceTabNodeId);
  if (!sourceConfig) return null;
  const item = sourceConfig.tabs.find((t) => t.id === tabId);
  if (!item) return null;

  if (sourceTabNodeId === targetTabNodeId) {
    const withoutItem = sourceConfig.tabs.filter((t) => t.id !== tabId);
    const clamped = Math.max(0, Math.min(targetIndex, withoutItem.length));
    const tabs = [...withoutItem.slice(0, clamped), item, ...withoutItem.slice(clamped)];
    model.doAction(Actions.updateNodeAttributes(sourceTabNodeId, { config: { ...sourceConfig, tabs } }));
    return item.id;
  }

  const targetConfig = getGroupConfig(model, targetTabNodeId);
  if (!targetConfig) return null;

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
export function moveTabToNewPane(model: Model, sourceTabNodeId: string, tabId: string): boolean {
  const config = getGroupConfig(model, sourceTabNodeId);
  if (!config) return false;
  const item = config.tabs.find((t) => t.id === tabId);
  if (!item) return false;
  if (config.tabs.length <= 1) return false;
  const sourceNode = model.getNodeById(sourceTabNodeId);
  if (!(sourceNode instanceof TabNode)) return false;
  const tabSetId = sourceNode.getParent()?.getId();
  if (!tabSetId) return false;

  const remaining = config.tabs.filter((t) => t.id !== tabId);
  const activeTabId = config.activeTabId === tabId ? remaining[0].id : config.activeTabId;
  model.doAction(
    Actions.updateNodeAttributes(sourceTabNodeId, { config: { ...config, tabs: remaining, activeTabId } }),
  );
  model.doAction(Actions.addNode(tabGroupNodeJson(item), tabSetId, DockLocation.RIGHT, -1, true));
  return true;
}

/** Closes one tab within the group; closing the last tab removes the pane
 * itself (matches a real browser: closing your only tab closes the
 * window). Returns the tab that's now active, or null if the whole pane
 * was removed. */
export function closeTabInGroup(model: Model, tabNodeId: string, tabId: string): string | null {
  const config = getGroupConfig(model, tabNodeId);
  if (!config) return null;
  const idx = config.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return config.activeTabId;
  const tabs = config.tabs.filter((t) => t.id !== tabId);
  if (tabs.length === 0) {
    model.doAction(Actions.deleteTab(tabNodeId));
    return null;
  }
  const activeTabId =
    config.activeTabId === tabId ? (tabs[idx] ?? tabs[idx - 1] ?? tabs[0]).id : config.activeTabId;
  model.doAction(Actions.updateNodeAttributes(tabNodeId, { config: { ...config, tabs, activeTabId } }));
  return activeTabId;
}
