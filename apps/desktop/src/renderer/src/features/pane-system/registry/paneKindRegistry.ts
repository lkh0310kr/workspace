import type { Model } from 'flexlayout-react'
import type { ComponentType, ReactNode, RefObject } from 'react'
import type { ContextMenuItem } from '@renderer/adapters/ui'
import type { PaneTabItem, TabKind } from '../layout/paneTypes'

// The pane-kind plugin registry — collapses what used to be a hardcoded
// `item.kind === "x"` switch repeated across PaneGroup.tsx (render),
// PaneTabStrip.tsx (tab chip label), layoutActions.ts (factory), and
// paneTypes.ts (label/icon/picker entries) into one PaneKindDefinition
// object per kind, registered once in builtinPaneKinds.ts. Adding a new
// pane kind now touches:
//   1. TabKind in paneTypes.ts (+ any kind-specific optional fields on
//      PaneTabItem, + layoutSalvage.ts's zod schema) — kept as a closed
//      union deliberately, not an open string: it's the thing that keeps
//      a corrupted/hand-edited persisted layout.json from resurrecting a
//      tab of a kind nothing can render.
//   2. One feature-owned pane-kind adapter exporting a PaneKindDefinition.
//   3. One line in builtinPaneKinds.ts registering it.
// No more touching PaneGroup.tsx/PaneTabStrip.tsx/layoutActions.ts.

export interface PaneRenderContext {
  workspaceTabId: number
  nodeId: string
  rootPath: string
  model: Model
  item: PaneTabItem
  /** This is the pane group's currently-selected tab. */
  active: boolean
  /** Pane group owns keyboard focus, even when an embedded surface is active. */
  groupFocused: boolean
  /** The whole workspace tab (and thus this pane) is the one currently on
   * screen — false while switched away to a different workspace tab. */
  paneVisible: boolean
  /** paneVisible && active, precomputed (interaction/embedPolicy.ts) — the CSS-level
   * "should this chip's content actually paint" signal, distinct from
   * `active` because every tab's content stays mounted at once (see
   * PaneGroup.tsx's header comment) and only visibility is toggled. */
  chipShown: boolean
  /** Cmd+'+'/Cmd+'-' per-pane text zoom, shared by every tab in the group. */
  zoom: number
  dirty: boolean
  setDirty: (dirty: boolean, viewStateKey?: string) => void
  /** Find-in-Files "jump to this line" — ephemeral, only meaningful for
   * kind === "code" | "markdown". */
  jumpToLine: number | undefined
  onJumpConsumed: () => void
  updateItem: (patch: Partial<PaneTabItem>) => void
  /** Opens `path` in this same pane group (switching to it if already
   * open), used by TreeView/Quick Open/Find-in-Files click-throughs. */
  openOrSwitchToFile: (
    path: string,
    kind: 'code' | 'markdown' | 'viewer',
    jumpToLine?: number,
    pin?: boolean
  ) => void
  /** Adds a brand new tab to this same pane group and activates it — used
   * for "open this link/article as a new browser tab" style actions. */
  openNewTab: (kind: TabKind, source?: Partial<PaneTabItem>) => void
  /** Orca overlay parity — pointer down on browser guest focuses this split. */
  focusPaneGroup: () => void
  /** Activate another chip in this pane group (browser overlay click-to-select). */
  selectPaneTab: (id: string) => void
}

export interface PaneKindPickerEntry {
  label: string
  icon: string
  source?: Partial<PaneTabItem>
}

/** Optional overlay layer for pane kinds whose embedded surface is hosted
 * beside the normal tab content (for example Electron webview guests). */
export interface PaneOverlayRenderContext {
  nodeId: string
  paneVisible: boolean
  items: PaneTabItem[]
  activeItemId: string
  renderItem: (item: PaneTabItem, active: boolean) => ReactNode
  onFocusOwningGroup: () => void
}

export interface PaneSidebarRenderContext {
  workspaceTabId: number
  nodeId: string
  rootPath: string
  model: Model
  paneVisible: boolean
  isGroupFocused: boolean
  bodyFits: boolean
  focusHostRef: RefObject<HTMLElement | null>
  selectedPath: string | null
  onOpenFile: (
    path: string,
    kind: 'code' | 'markdown' | 'viewer',
    jumpToLine?: number,
    pin?: boolean
  ) => void
  onNotifyChanged: () => void
  onVisibilityChange: (visible: boolean) => void
}

export interface PaneFileOpenContext {
  model: Model
  nodeId: string
  tabs: PaneTabItem[]
  path: string
  kind: 'code' | 'markdown' | 'viewer'
  jumpToLine?: number
  pin?: boolean
  isDirty: (tabId: string) => boolean
  onJumpToLine: (tabId: string, line: number) => void
  selectTab: (tabId: string) => void
  onNotifyChanged: () => void
}

export interface PaneKindDefinition {
  kind: TabKind
  /** Pane-node title (flexlayout tab name) when this is the founding tab
   * of a brand new pane — see layoutActions.ts's tabGroupNodeJson. */
  label: string
  icon: string
  /** Tab chip content — rendered for EVERY tab in the group at once (not
   * just the active one; see PaneRenderContext.chipShown), never
   * conditionally mounted/unmounted on tab switch. */
  render: (ctx: PaneRenderContext) => ReactNode
  /** Renders this kind's shared overlay layer. The shell keeps it mounted
   * with the pane group; item and visibility changes must not imply guest
   * destruction. */
  renderOverlay?: (ctx: PaneOverlayRenderContext) => ReactNode
  /** Optional kind-owned sidebar, mounted only while this kind is active. */
  renderSidebar?: ComponentType<PaneSidebarRenderContext>
  /** Optional kind-owned tab icon; generic pane-system UI supplies the fallback. */
  renderTabIcon?: (item: PaneTabItem, size: number) => ReactNode
  /** Optional path-opening behavior supplied by Editor-like features. */
  openFileInGroup?: (context: PaneFileOpenContext) => void | Promise<void>
  /** Base tab-chip label. The dirty "•" prefix is applied generically on
   * top of this by paneTabLabel, not per kind. */
  tabLabel: (item: PaneTabItem) => string
  /** Builds a fresh PaneTabItem of this kind (may be async — terminal
   * spawns a real pty). */
  createItem: (
    id: string,
    source?: Partial<PaneTabItem>,
    workspaceTabId?: number
  ) => PaneTabItem | Promise<PaneTabItem>
  /** Kind-owned dirty confirmation before a tab is removed from layout. */
  beforeCloseItem?: (
    item: PaneTabItem,
    options: { skipDirtyConfirm?: boolean }
  ) => boolean | Promise<boolean>
  /** Releases resources owned by this kind after close was accepted. */
  onItemRemoved?: (item: PaneTabItem) => void | Promise<void>
  /** Kind-owned dirty state bridge for editor-like documents. */
  onDirtyChange?: (item: PaneTabItem, dirty: boolean, viewStateKey?: string) => void
  /** Zero or more "+ New Tab" / pane-picker entries this kind offers — a
   * kind can have none (not directly pickable — "code" and the internal
   * extension-routed viewer aren't; untitled files are always created as
   * "markdown"), or one or more entries. */
  pickerEntries?: PaneKindPickerEntry[]
  /** Extra tab-strip context menu entries for this kind (prepended). */
  tabContextMenuItems?: (
    item: PaneTabItem,
    actions: { updateItem: (patch: Partial<PaneTabItem>) => void }
  ) => ContextMenuItem[]
}

const registry = new Map<TabKind, PaneKindDefinition>()

export function registerPaneKind(def: PaneKindDefinition): void {
  if (registry.has(def.kind)) {
    throw new Error(`pane kind "${def.kind}" is already registered`)
  }
  registry.set(def.kind, def)
}

export function getPaneKind(kind: TabKind): PaneKindDefinition {
  const def = registry.get(kind)
  if (!def) throw new Error(`pane kind "${kind}" is not registered — see builtinPaneKinds.ts`)
  return def
}

/** Registration order, which is also picker-list order. */
export function allPaneKinds(): PaneKindDefinition[] {
  return [...registry.values()]
}

export function paneKindLabel(kind: TabKind): string {
  return getPaneKind(kind).label
}

export function paneKindIcon(kind: TabKind): string {
  return getPaneKind(kind).icon
}

/** Flattened "+ New Tab" / "change pane type" picker option list. */
export function paneKindPickerOptions(): {
  id: TabKind
  label: string
  icon: string
  source?: Partial<PaneTabItem>
}[] {
  return allPaneKinds().flatMap((def) =>
    (def.pickerEntries ?? []).map((entry) => ({ id: def.kind, ...entry }))
  )
}

/** Tab-chip label, with the generic dirty "•" prefix applied on top of
 * the kind's own base label. */
export function paneTabLabel(item: PaneTabItem, dirty: boolean): string {
  const base = getPaneKind(item.kind).tabLabel(item)
  return dirty ? `• ${base}` : base
}
