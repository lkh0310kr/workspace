import type { TerminalPaneHost } from '@workspace/terminal'
import { agentPaneKey, useAgentStatusStore } from '../../store/agentStatusStore'
import { registerTerminalAgentPane } from '../../terminal/terminalAgentPaneRegistry'
import { writeClipboardText } from '../../electron'
import { connectPanePty } from '../../terminal/connectPanePty'
import { interactionCoordinator } from '../../interaction/InteractionCoordinator'

export type { TerminalPaneHost } from '@workspace/terminal'

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
