import { type Model, TabNode } from "flexlayout-react";
import {
  closeTabInGroup,
  updateTabInGroup,
} from "../layout/layoutActions";
import type { PaneGroupConfig } from "../layout/paneTypes";
import { getPaneKind } from "../panes/paneKindRegistry";

export interface PaneExplorerBridge {
  nodeId: string;
  filePath: string | null;
  supportsExplorer: boolean;
  openOrSwitchToFile: (
    path: string,
    kind: "code" | "markdown" | "viewer",
    jumpToLine?: number,
    pin?: boolean,
  ) => void;
}

function bridgeKey(workspaceTabId: number, nodeId: string): string {
  return `${workspaceTabId}:${nodeId}`;
}

const bridges = new Map<string, PaneExplorerBridge>();

export function registerPaneExplorerBridge(
  workspaceTabId: number,
  nodeId: string,
  target: PaneExplorerBridge,
): void {
  bridges.set(bridgeKey(workspaceTabId, nodeId), target);
}

export function unregisterPaneExplorerBridge(workspaceTabId: number, nodeId: string): void {
  bridges.delete(bridgeKey(workspaceTabId, nodeId));
}

export function getPaneExplorerBridge(workspaceTabId: number, nodeId: string): PaneExplorerBridge | null {
  return bridges.get(bridgeKey(workspaceTabId, nodeId)) ?? null;
}

export function getActivePaneExplorerBridge(workspaceTabId: number, model: Model): PaneExplorerBridge | null {
  const tabNode = getActivePaneTabNode(model);
  if (!tabNode) return null;
  return getPaneExplorerBridge(workspaceTabId, tabNode.getId());
}

export function getActivePaneTabNode(model: Model): TabNode | null {
  const tabNode = model.getActiveTabset()?.getSelectedNode();
  if (!tabNode || tabNode.getType() !== "tab") return null;
  return tabNode as TabNode;
}

export function activePaneSupportsExplorer(model: Model): boolean {
  const tabNode = getActivePaneTabNode(model);
  if (!tabNode) return false;
  const config = (tabNode.getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
  const active = config.tabs.find((t) => t.id === config.activeTabId) ?? config.tabs[0];
  return active ? getPaneKind(active.kind).hasFileExplorer === true : false;
}

export function renamePathAcrossWorkspacePanes(
  model: Model,
  nodeId: string,
  from: string,
  to: string,
  onChanged: () => void,
): void {
  const node = model.getNodeById(nodeId);
  if (!(node instanceof TabNode)) return;
  const config = (node.getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
  let changed = false;
  for (const t of config.tabs) {
    if (!t.filePath) continue;
    if (t.filePath === from) {
      updateTabInGroup(model, nodeId, t.id, { filePath: to });
      changed = true;
    } else if (t.filePath.startsWith(`${from}/`)) {
      updateTabInGroup(model, nodeId, t.id, { filePath: to + t.filePath.slice(from.length) });
      changed = true;
    }
  }
  if (changed) onChanged();
}

export function renamePathInAllPanes(
  model: Model,
  from: string,
  to: string,
  onChanged: () => void,
): void {
  model.visitNodes((node) => {
    if (!(node instanceof TabNode)) return;
    renamePathAcrossWorkspacePanes(model, node.getId(), from, to, onChanged);
  });
}

export function deletePathInAllPanes(
  model: Model,
  path: string,
  onChanged: () => void,
): void {
  model.visitNodes((node) => {
    if (!(node instanceof TabNode)) return;
    const nodeId = node.getId();
    const config = (node.getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
    for (const t of config.tabs) {
      if (t.filePath === path || t.filePath?.startsWith(`${path}/`)) {
        closeTabInGroup(model, nodeId, t.id);
        onChanged();
      }
    }
  });
}
