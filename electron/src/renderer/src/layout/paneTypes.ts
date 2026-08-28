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

export type TabKind = "terminal" | "browser" | "code" | "markdown" | "viewer" | "rss" | "vector";

export interface PaneTabItem {
  id: string;
  kind: TabKind;
  /** kind === "terminal" */
  terminalId?: number;
  /** kind === "code" | "markdown" | "viewer" */
  filePath?: string | null;
  /** kind === "viewer" — set instead of filePath when the file was picked
   * via the native Browse dialog rather than opened from within the
   * workspace root (TreeView/Quick Open/Find in Files). Deliberately not
   * confined to any workspace root — the user picked it explicitly
   * through an OS-level file dialog. */
  absolutePath?: string;
  /** kind === "viewer" — set only on a blank tab created via the Video/
   * Audio/Ebook picker entries, before a file has been picked; decides the
   * Browse button's label/dialog filters and the "no file yet" empty
   * state. Irrelevant (and ignored) once filePath/absolutePath is set. */
  viewerHint?: "video" | "audio" | "ebook";
  /** kind === "browser" */
  url?: string;
  /** kind === "rss" — one feed per tab, entered once then persisted like
   * browser's url. */
  feedUrl?: string;
  /** kind === "browser" — page favicon URL from page-favicon-updated */
  favicon?: string;
  /** kind === "browser" — guest page zoom (1 = 100%) */
  zoomFactor?: number;
  /** Live display title (browser page title, editor filename) — terminal
   * tabs don't use this, their chip just shows a fixed "Terminal" label. */
  title?: string;
  /** VSCode-style "preview" tab (TreeView single-click) — at most one per
   * pane. Reused/replaced by the next preview-click instead of piling up
   * a new tab, unless it has unsaved edits (see PaneGroup's
   * openOrSwitchToFile) or gets explicitly pinned (double-click, or
   * Cmd/Ctrl+click opens a new pinned tab directly). */
  isPreview?: boolean;
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

// Per-kind behavior (label/icon/render/picker entries/factory) lives in
// paneKindRegistry.ts + panes/kinds/*, not here — this file stays a pure
// data model with no registry dependency (the registry itself imports
// TabKind/PaneTabItem from here, so the reverse would be circular).
// tabKindLabel/tabKindIcon/TAB_KIND_OPTIONS moved to
// paneKindLabel/paneKindIcon/paneKindPickerOptions in paneKindRegistry.ts.
