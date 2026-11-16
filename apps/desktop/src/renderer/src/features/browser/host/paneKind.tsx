import { createBrowserPaneKind } from '@workspace/browser'
import type { PaneKindDefinition } from '@renderer/features/pane-system/registry/paneKindRegistry'
import type { PaneTabItem } from '@renderer/features/pane-system/layout/paneTypes'
import { desktopBrowserPaneHost } from './index'

export const browserPaneKind: PaneKindDefinition = createBrowserPaneKind<PaneTabItem>(
  desktopBrowserPaneHost
)
