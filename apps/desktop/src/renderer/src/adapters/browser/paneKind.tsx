import { createBrowserPaneKind } from '@workspace/browser'
import type { PaneKindDefinition } from '../../features/pane-system/paneKindRegistry'
import type { PaneTabItem } from '../../features/pane-system/layout/paneTypes'
import { desktopBrowserPaneHost } from './index'

export const browserPaneKind: PaneKindDefinition = createBrowserPaneKind<PaneTabItem>(
  desktopBrowserPaneHost
)
