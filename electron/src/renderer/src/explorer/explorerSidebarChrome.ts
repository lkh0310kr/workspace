/** Sidebar chrome keyed by workspace tab — shared across all panes in the tab. */

import { workspaceTabKey } from "./workspaceTabKey";

const TREE_OPEN_KEY = "workspace.editorTreeOpen";
const TREE_WIDTH_KEY = "workspace.editorTreeWidth";
const SIDEBAR_MODE_KEY = "workspace.sidebarMode";

export type SidebarMode = "explorer" | "search";

function openKey(tabKey: string): string {
  return `${TREE_OPEN_KEY}.${tabKey}`;
}

function widthKey(tabKey: string): string {
  return `${TREE_WIDTH_KEY}.${tabKey}`;
}

function modeKey(tabKey: string): string {
  return `${SIDEBAR_MODE_KEY}.${tabKey}`;
}

export function getStoredSidebarMode(tabKey: string): SidebarMode {
  return localStorage.getItem(modeKey(tabKey)) === "search" ? "search" : "explorer";
}

export function getStoredTreeOpen(tabKey: string): boolean {
  const stored = localStorage.getItem(openKey(tabKey));
  return stored === null ? true : stored === "1";
}

export function getStoredTreeWidth(tabKey: string): number {
  const stored = Number(localStorage.getItem(widthKey(tabKey)));
  return Number.isFinite(stored) && stored > 0 ? stored : 200;
}

export function setStoredTreeOpen(tabKey: string, open: boolean): void {
  localStorage.setItem(openKey(tabKey), open ? "1" : "0");
}

export function setStoredTreeWidth(tabKey: string, width: number): void {
  localStorage.setItem(widthKey(tabKey), String(width));
}

export function setStoredSidebarMode(tabKey: string, mode: SidebarMode): void {
  localStorage.setItem(modeKey(tabKey), mode);
}

/** Seed workspace-tab keys from a legacy per-pane or per-editor-tab key once. */
export function migrateLegacySidebarToWorkspaceTab(workspaceTabId: number, legacyKey: string): void {
  const tabKey = workspaceTabKey(workspaceTabId);
  if (localStorage.getItem(openKey(tabKey)) === null) {
    const legacy = localStorage.getItem(`${TREE_OPEN_KEY}.${legacyKey}`);
    if (legacy !== null) localStorage.setItem(openKey(tabKey), legacy);
  }
  if (localStorage.getItem(widthKey(tabKey)) === null) {
    const legacy = localStorage.getItem(`${TREE_WIDTH_KEY}.${legacyKey}`);
    if (legacy !== null) localStorage.setItem(widthKey(tabKey), legacy);
  }
  if (localStorage.getItem(modeKey(tabKey)) === null) {
    const legacy = localStorage.getItem(`${SIDEBAR_MODE_KEY}.${legacyKey}`);
    if (legacy !== null) localStorage.setItem(modeKey(tabKey), legacy);
  }
}
