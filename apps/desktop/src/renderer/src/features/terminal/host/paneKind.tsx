import { createTerminalPaneKind } from '@workspace/terminal'
import { desktopTerminalPaneHost } from './terminalPaneHost'
import type { PaneKindDefinition } from '@renderer/features/pane-system/registry/paneKindRegistry'
import type { PaneTabItem } from '@renderer/features/pane-system/layout/paneTypes'

export const terminalPaneKind: PaneKindDefinition = createTerminalPaneKind<PaneTabItem>(
  desktopTerminalPaneHost
)
