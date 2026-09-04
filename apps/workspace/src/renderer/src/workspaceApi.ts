// Workspace rail tab IPC — split from electron.ts (Phase 1 foundation).

export interface TabInfo {
  id: number;
  title: string;
  layout_json: string;
  root_path: string;
}

export interface WorkspaceState {
  tabs: TabInfo[];
  active_tab_id: number;
}

interface RawTabInfo {
  id: number;
  title: string;
  layoutJson: string;
  rootPath: string;
}

interface RawWorkspaceState {
  tabs: RawTabInfo[];
  activeTabId: number;
}

function toTabInfo(t: RawTabInfo): TabInfo {
  return { id: t.id, title: t.title, layout_json: t.layoutJson, root_path: t.rootPath };
}

export function toWorkspaceState(s: RawWorkspaceState): WorkspaceState {
  return { tabs: s.tabs.map(toTabInfo), active_tab_id: s.activeTabId };
}

export async function getWorkspaceState(): Promise<WorkspaceState> {
  return toWorkspaceState(await window.api.workspace.getState());
}

export async function addTab(): Promise<number> {
  return window.api.workspace.addTab();
}

export async function closeTab(tabId: number): Promise<void> {
  return window.api.workspace.closeTab(tabId);
}

export async function selectTab(tabId: number): Promise<void> {
  return window.api.workspace.selectTab(tabId);
}

export async function renameTab(tabId: number, title: string): Promise<void> {
  return window.api.workspace.renameTab(tabId, title);
}

export async function reorderTabs(orderedIds: number[]): Promise<void> {
  return window.api.workspace.reorderTabs(orderedIds);
}

export async function setTabLayout(tabId: number, layoutJson: string): Promise<void> {
  return window.api.workspace.setTabLayout(tabId, layoutJson);
}

export async function setTabRootPath(tabId: number, path: string): Promise<WorkspaceState> {
  return toWorkspaceState(await window.api.workspace.setTabRootPath(tabId, path));
}

export function onWorkspaceUpdated(handler: (state: WorkspaceState) => void): () => void {
  return window.api.workspace.onUpdated((s) => handler(toWorkspaceState(s)));
}
