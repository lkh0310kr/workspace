import { Fragment } from 'react'
import {
  BrowserContent,
  BrowserPaneOverlaySlot,
  browserTabUrlForNewTab,
  getBrowserTabLabel
} from '@workspace/browser'
import type { PaneKindDefinition } from '../../features/pane-system/paneKindRegistry'
import { closeBrowserTab, desktopBrowserPaneHost } from './index'

export const browserPaneKind: PaneKindDefinition = {
  kind: 'browser',
  label: 'Browser',
  icon: 'browser',
  pickerEntries: [{ label: 'Browser', icon: 'browser' }],
  createItem(id, source) {
    return { id, kind: 'browser', url: browserTabUrlForNewTab(source?.url) }
  },
  tabLabel(item) {
    return getBrowserTabLabel(item)
  },
  renderTabIcon(item) {
    return item.favicon ? <img src={item.favicon} className="pane-tab-favicon" alt="" /> : null
  },
  onItemRemoved(item) {
    closeBrowserTab(item.id)
  },
  render(ctx) {
    return (
      <BrowserContent
        host={desktopBrowserPaneHost}
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
  renderOverlay(ctx) {
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
