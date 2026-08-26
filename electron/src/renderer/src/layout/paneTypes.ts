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
  /** kind === "browser" — page favicon URL from page-favicon-updated */
  favicon?: string;
  /** kind === "browser" — guest page zoom (1 = 100%) */
  zoomFactor?: number;
  /** Live display title (browser page title, editor filename) — terminal
   * tabs don't use this, their chip just shows a fixed "Terminal" label. */
  title?: string;
}

export interface PaneGroupConfig {
  /** Written by layoutSalvage on load; omitted in older persisted layouts. */
  schemaVersion?: number;
  tabs: PaneTabItem[];
  activeTabId: string;
  /** Cmd+'+'/Cmd+'-' per-pane text zoom (App.tsx's zoomActivePane), shared
   * across every tab in the group — 1 = 100%. */
  zoom?: number;
}

// Icon/label for every kind a tab can actually be — used for rendering an
// already-open tab's chip (PaneTabStrip.tsx), regardless of which picker
// created it.
const TAB_KIND_META: Record<TabKind, { label: string; icon: string }> = {
  terminal: { label: "Terminal", icon: "⌘" },
  browser: { label: "Browser", icon: "🌐" },
  code: { label: "Code", icon: "{}" },
  markdown: { label: "Editor", icon: "{}" },
};

// The "add new tab" / "change pane type" picker list (PanePicker.tsx) —
// deliberately fewer entries than TabKind has values. Code and Markdown
// used to be offered as two separate choices here (the "Pane Select
// Dialog - Code <-> Markdown Pane -> Editor" TODO item), but picking one
// ahead of time never mattered: a brand new tab has no file yet, and
// findAvailableUntitledName (EditorContent.tsx) only ever creates .md
// files regardless of which one was chosen. Opening an *existing*
// non-markdown file (via TreeView, which classifies by extension) still
// produces a real "code"-kind tab — this list only affects the picker,
// not what TAB_KIND_META can render.
export const TAB_KIND_OPTIONS: { id: TabKind; label: string; icon: string }[] = [
  { id: "terminal", label: "Terminal", icon: "⌘" },
  { id: "browser", label: "Browser", icon: "🌐" },
  { id: "markdown", label: "Editor", icon: "{}" },
];

export function tabKindLabel(kind: TabKind): string {
  return TAB_KIND_META[kind].label;
}

export function tabKindIcon(kind: TabKind): string {
  return TAB_KIND_META[kind].icon;
}
