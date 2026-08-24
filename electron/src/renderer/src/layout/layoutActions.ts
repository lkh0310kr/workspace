import { Actions, DockLocation, Model, TabNode } from "flexlayout-react";
import { spawnTerminal } from "../electron";
import { PaneGroupConfig, PaneTabItem, TabKind, tabKindLabel } from "./paneTypes";

let itemCounter = 0;

function nextTabId(kind: TabKind): string {
  itemCounter += 1;
  return `${kind}-${itemCounter}`;
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

export async function splitTabSet(
  model: Model,
  tabSetId: string,
  direction: "right" | "down",
  kind: TabKind,
  source?: Partial<PaneTabItem>,
) {
  const item = await buildTabItem(kind, source);
  const location = direction === "right" ? DockLocation.RIGHT : DockLocation.BOTTOM;
  model.doAction(Actions.addNode(tabGroupNodeJson(item), tabSetId, location, -1, true));
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
 * Pulls one tab out of a group into a brand-new sibling pane, synchronously
 * (no spawning/async — the tab item and its underlying terminal/webview
 * already exist, this just relocates which pane node owns it), so the
 * caller can immediately hand the new node to flexlayout's own
 * moveTabWithDragAndDrop and let the user drag it wherever they want —
 * "drag a specific tab chip to move just that tab" reuses flexlayout's
 * real drag-and-drop instead of reimplementing pointer-tracking DnD for
 * our own virtual sub-tabs. Returns null (and does nothing) if this is the
 * group's only tab — moving it would just be moving the whole pane, which
 * the caller should do via the existing whole-strip drag instead.
 */
export function extractTabToNewPane(model: Model, sourceTabNodeId: string, tabId: string): TabNode | null {
  const config = getGroupConfig(model, sourceTabNodeId);
  if (!config || config.tabs.length <= 1) return null;
  const item = config.tabs.find((t) => t.id === tabId);
  if (!item) return null;
  const sourceNode = model.getNodeById(sourceTabNodeId);
  if (!(sourceNode instanceof TabNode)) return null;
  const tabSetId = sourceNode.getParent()?.getId();
  if (!tabSetId) return null;

  const remainingTabs = config.tabs.filter((t) => t.id !== tabId);
  const activeTabId = config.activeTabId === tabId ? remainingTabs[0].id : config.activeTabId;
  model.doAction(
    Actions.updateNodeAttributes(sourceTabNodeId, { config: { ...config, tabs: remainingTabs, activeTabId } }),
  );

  const newNodeJson = tabGroupNodeJson(item);
  model.doAction(Actions.addNode(newNodeJson, tabSetId, DockLocation.RIGHT, -1, true));
  const newNode = model.getNodeById(newNodeJson.id);
  return newNode instanceof TabNode ? newNode : null;
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
