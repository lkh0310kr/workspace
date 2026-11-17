import { Model, TabNode } from 'flexlayout-react'
import { PaneGroupConfig, PaneTabItem, TabKind } from './paneTypes'
import { getPaneKind, paneKindLabel } from '../registry/paneKindRegistry'
import { usePaneSystemStore } from '../state/paneSystemStore'
import { findTabIdForModel } from './workspaceLayoutModels'

/** PaneGroup reads tabNode.getConfig() — bump revision only when the tab list
 * structure changes, not on activeTabId-only persists (that remounted
 * terminals/webviews on every tab click). */
export function bumpPaneGroupRender(model: Model): void {
  const tabId = findTabIdForModel(model)
  if (tabId !== undefined) {
    usePaneSystemStore.getState().bumpLayoutRevision(tabId)
  }
}

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
  return `${kind}-${crypto.randomUUID()}`
}

export async function buildTabItem(
  kind: TabKind,
  source?: Partial<PaneTabItem>,
  workspaceTabId?: number
): Promise<PaneTabItem> {
  const id = nextTabId(kind)
  return getPaneKind(kind).createItem(id, source, workspaceTabId)
}

// The pane (flexlayout tab node) id must never be derived from the
// *first* tab item it happens to hold — a pane's own id outlives any
// single tab inside it (more tabs get added via addTabToGroup without
// ever changing the pane's id), so deriving it from `item.id` meant
// dragging that original founding tab out into its own new pane
// (moveTabToNewPane, below) tried to create a new node reusing the exact
// id the *source* pane (still alive, holding the remaining tabs) was
// already using — "each node must have a unique id, duplicate id:
// tabgroup-...", and the drag silently failed. A pane's id is its own
// identity, generated fresh every time a new pane is created, regardless
// of which item ends up inside it.
export function tabGroupNodeJson(item: PaneTabItem) {
  const config: PaneGroupConfig = { tabs: [item], activeTabId: item.id }
  return {
    type: 'tab' as const,
    id: `tabgroup-${crypto.randomUUID()}`,
    name: paneKindLabel(item.kind),
    component: 'tabgroup' as const,
    config
  }
}

export function getGroupConfig(model: Model, tabNodeId: string): PaneGroupConfig | null {
  const node = model.getNodeById(tabNodeId)
  if (!(node instanceof TabNode)) return null
  return (node.getConfig() ?? { tabs: [], activeTabId: '' }) as PaneGroupConfig
}

/** flexlayout ADD_TAB only accepts tabset / row / border targets — not tab
 * node ids. Passing a tab id silently no-ops (pane vanishes on split). */
export function resolveTabSetId(model: Model, tabNodeId: string): string | null {
  const node = model.getNodeById(tabNodeId)
  if (!(node instanceof TabNode)) return null
  const parent = node.getParent()
  return parent?.getType() === 'tabset' ? parent.getId() : null
}
