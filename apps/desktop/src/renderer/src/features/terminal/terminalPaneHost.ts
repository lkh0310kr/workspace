import type { TuiAgent } from '../../../../shared/agent/tui-agent'
import { agentPaneKey, useAgentStatusStore } from '../../store/agentStatusStore'
import { registerTerminalAgentPane } from '../../terminal/terminalAgentPaneRegistry'
import { writeClipboardText } from '../../electron'
import { connectPanePty } from '../../terminal/connectPanePty'
import type { ManagedPane } from '../../lib/pane-manager/pane-manager-types'
import type { PtyTransport } from '../../terminal/ptyTransport'
import { interactionCoordinator } from '../../interaction/InteractionCoordinator'

export interface TerminalPaneHost {
  registerPortal: (id: string, onDismiss: () => void) => () => void
  getPlatformInfo: () => ReturnType<typeof window.api.platformInfo.get>
  setFocusedTerminal: (terminalId: number | null) => void
  registerAgentPane: (
    terminalId: number,
    workspaceTabId: number,
    paneTabId: string,
    terminalAgent?: TuiAgent
  ) => void
  unregisterAgentPane: (terminalId: number) => void
  registerLiveTerminal: (terminalId: number) => void
  writeClipboardText: (text: string) => void
  ensureAgentWorking: (workspaceTabId: number, paneTabId: string, terminalAgent?: TuiAgent) => void
  connectPty: (
    pane: ManagedPane,
    terminalId: number,
    options: Parameters<typeof connectPanePty>[2]
  ) => { transport: PtyTransport; dispose: () => void }
}

/** Desktop adapter for the process, agent and clipboard capabilities used by
 * the terminal pane view. The pane can receive an in-memory test host. */
export const desktopTerminalPaneHost: TerminalPaneHost = {
  registerPortal: (id, onDismiss) => interactionCoordinator.registerPortal(id, onDismiss),
  getPlatformInfo: () => window.api.platformInfo.get(),
  setFocusedTerminal: (terminalId) => window.api.terminal.setFocused(terminalId),
  registerAgentPane: (terminalId, workspaceTabId, paneTabId, terminalAgent) => {
    registerTerminalAgentPane(terminalId, { workspaceTabId, paneTabId, terminalAgent })
    window.api.agentStatus.registerTerminalPane(terminalId, agentPaneKey(workspaceTabId, paneTabId))
  },
  unregisterAgentPane: (terminalId) => window.api.agentStatus.unregisterTerminalPane(terminalId),
  registerLiveTerminal: (terminalId) =>
    useAgentStatusStore.getState().registerLiveTerminal(terminalId),
  writeClipboardText,
  ensureAgentWorking: (workspaceTabId, paneTabId, terminalAgent) => {
    if (!terminalAgent) return
    const paneKey = agentPaneKey(workspaceTabId, paneTabId)
    const existing = useAgentStatusStore.getState().agentStatusByPaneKey[paneKey]
    if (existing?.state === 'working') return
    useAgentStatusStore
      .getState()
      .setAgentStatus(
        paneKey,
        { state: 'working', prompt: '', agentType: terminalAgent },
        { workspaceTabId, titleDerived: true }
      )
  },
  connectPty: (pane, terminalId, options) => connectPanePty(pane, terminalId, options)
}
