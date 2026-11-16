import { createTerminalPaneKind } from '@workspace/terminal'
import { desktopTerminalPaneHost } from './terminalPaneHost'
import type { PaneKindDefinition } from '../../features/pane-system/paneKindRegistry'
import type { PaneTabItem } from '../../features/pane-system/layout/paneTypes'

export const terminalPaneKind: PaneKindDefinition = createTerminalPaneKind<PaneTabItem>(
  desktopTerminalPaneHost
)
