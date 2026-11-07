import { Model, TabNode } from "flexlayout-react";
import { setActiveTabInGroup } from "./layoutActions";
import type { PaneGroupConfig, PaneTabItem } from "./paneTypes";

/** Read a pane group's persisted config from flexlayout — the single source
 * of truth for tab lists and `activeTabId`. */
export function readPaneGroupConfig(tabNode: TabNode): PaneGroupConfig {
  return (tabNode.getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
}

/** Resolve which chip is active, falling back when `activeTabId` is stale. */
export function resolveActivePaneTabId(config: PaneGroupConfig): string {
  const { tabs, activeTabId } = config;
  if (tabs.length === 0) return "";
  if (tabs.some((t) => t.id === activeTabId)) return activeTabId;
  return tabs[0].id;
}

export function resolveActivePaneTab(config: PaneGroupConfig): PaneTabItem | undefined {
  const id = resolveActivePaneTabId(config);
  return config.tabs.find((t) => t.id === id);
}

/** Write the active chip through flexlayout only (no parallel zustand copy). */
export function activatePaneTab(model: Model, tabNodeId: string, tabItemId: string): boolean {
  const node = model.getNodeById(tabNodeId);
  if (!(node instanceof TabNode)) return false;
  const config = readPaneGroupConfig(node);
  if (!config.tabs.some((t) => t.id === tabItemId)) return false;
  setActiveTabInGroup(model, tabNodeId, tabItemId);
  return true;
}
