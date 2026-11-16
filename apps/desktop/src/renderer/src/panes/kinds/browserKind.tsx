import { Fragment } from 'react'
import {
  BrowserContent,
  BrowserPaneOverlaySlot,
  desktopBrowserPaneHost
} from '../../features/browser'
import type { PaneKindDefinition } from '../paneKindRegistry'

export const browserPaneKind: PaneKindDefinition = {
  kind: 'browser',
  label: 'Browser',
  icon: 'browser',
  pickerEntries: [{ label: 'Browser', icon: 'browser' }],
  createItem(id, source) {
    return { id, kind: 'browser', url: source?.url ?? 'https://www.google.com' }
  },
  tabLabel(item) {
    if (item.title?.trim()) return item.title.trim()
    try {
      return item.url ? new URL(item.url).hostname : 'New Tab'
    } catch {
      return item.url || 'New Tab'
    }
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
