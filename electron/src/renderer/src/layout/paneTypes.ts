// Orca's actual pane architecture treats every kind of content (terminal,
// browser page, editor file — Orca also has a mobile simulator kind, not
// ported here per user direction) as one flat list of "unified tabs" you
// switch between with a single shared tab strip, instead of each kind
// having its own separate tab/pane concept. This app's old model had that
// only for the editor pane (EditorPane.tsx's own openTabs/EditorTabBar) —
// terminal and browser panes were each a single fixed item with no tabs of
// their own. This file is the data model for the generalized version: a
// flexlayout pane node ("tab group") now always holds a PaneGroupConfig —
// a list of heterogeneous PaneTabItems plus which one is active — instead
// of a single component+config pair.

export type TabKind = "terminal" | "browser" | "code" | "markdown";

export interface PaneTabItem {
  id: string;
  kind: TabKind;
  /** kind === "terminal" */
  terminalId?: number;
  /** kind === "code" | "markdown" */
  filePath?: string | null;
  /** kind === "browser" */
  url?: string;
  /** Live display title (browser page title, editor filename) — terminal
   * tabs don't use this, their chip just shows a fixed "Terminal" label. */
  title?: string;
}

export interface PaneGroupConfig {
  tabs: PaneTabItem[];
  activeTabId: string;
  /** Cmd+'+'/Cmd+'-' per-pane text zoom (App.tsx's zoomActivePane), shared
   * across every tab in the group — 1 = 100%. */
  zoom?: number;
}

export const TAB_KIND_OPTIONS: { id: TabKind; label: string; icon: string }[] = [
  { id: "terminal", label: "Terminal", icon: "⌘" },
  { id: "browser", label: "Browser", icon: "🌐" },
  { id: "code", label: "Code", icon: "{}" },
  { id: "markdown", label: "Markdown", icon: "M↓" },
];

export function tabKindLabel(kind: TabKind): string {
  return TAB_KIND_OPTIONS.find((k) => k.id === kind)?.label ?? kind;
}

export function tabKindIcon(kind: TabKind): string {
  return TAB_KIND_OPTIONS.find((k) => k.id === kind)?.icon ?? "";
}
