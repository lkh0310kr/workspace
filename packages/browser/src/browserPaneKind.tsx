import { Fragment, type ReactNode } from 'react'
import { BrowserContent } from './BrowserContent'
import { BrowserPaneOverlaySlot } from './BrowserPaneOverlaySlot'
import { browserTabUrlForNewTab, getBrowserTabLabel } from './browserTabPolicy'
import type { BrowserPaneHost, BrowserPaneItem } from './BrowserPaneHost'

interface BrowserPaneRenderContext<TItem extends BrowserPaneItem> {
  workspaceTabId: number
  nodeId: string
  item: TItem
  active: boolean
  paneVisible: boolean
  updateItem: (patch: Partial<BrowserPaneItem>) => void
  openNewTab: (kind: 'browser', source?: Partial<BrowserPaneItem>) => void
  focusPaneGroup: () => void
  selectPaneTab: (id: string) => void
}

interface BrowserPaneOverlayContext<TItem extends BrowserPaneItem> {
  nodeId: string
  paneVisible: boolean
  items: TItem[]
  activeItemId: string
  renderItem: (item: TItem, active: boolean) => ReactNode
  onFocusOwningGroup: () => void
}

/**
 * Builds the Browser's pane-system adapter without importing Desktop registry
 * types. Desktop provides the guest/lifecycle host at the composition root.
 */
export function createBrowserPaneKind<TItem extends BrowserPaneItem = BrowserPaneItem>(
  host: BrowserPaneHost
) {
  return {
    kind: 'browser' as const,
    label: 'Browser',
    icon: 'browser',
    pickerEntries: [{ label: 'Browser', icon: 'browser' }],
    createItem(id: string, source?: Partial<BrowserPaneItem>) {
      return { id, kind: 'browser' as const, url: browserTabUrlForNewTab(source?.url) }
    },
    tabLabel(item: BrowserPaneItem) {
      return getBrowserTabLabel(item)
    },
    renderTabIcon(item: BrowserPaneItem) {
      return item.favicon ? <img src={item.favicon} className="pane-tab-favicon" alt="" /> : null
    },
    onItemRemoved(item: BrowserPaneItem) {
      host.closeTabItem(item.id)
    },
    render(ctx: BrowserPaneRenderContext<TItem>) {
      return (
        <BrowserContent
          host={host}
          tabId={ctx.workspaceTabId}
          paneNodeId={ctx.nodeId}
          item={ctx.item}
          paneVisible={ctx.paneVisible}
          chipActive={ctx.active}
          onUpdate={ctx.updateItem}
          onOpenNewTab={(url) => ctx.openNewTab('browser', { url })}
          onFocusPaneGroup={ctx.focusPaneGroup}
          onSelectPaneTab={ctx.selectPaneTab}
        />
      )
    },
    renderOverlay(ctx: BrowserPaneOverlayContext<TItem>) {
      return (
        <BrowserPaneOverlaySlot
          paneNodeId={ctx.nodeId}
          paneVisible={ctx.paneVisible}
          onFocusOwningGroup={ctx.onFocusOwningGroup}
        >
          <div className="browser-pane-page-stack">
            {ctx.items.map((item) => (
              <Fragment key={item.id}>{ctx.renderItem(item, item.id === ctx.activeItemId)}</Fragment>
            ))}
          </div>
        </BrowserPaneOverlaySlot>
      )
    }
  }
}
