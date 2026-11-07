import { useAgentStatusStore } from '../store/agentStatusStore'
import { useRuntimeTerminalTitlesStore } from '../store/runtimeTerminalTitlesStore'
import { getTerminalAgentPaneBinding } from './terminalAgentPaneRegistry'
import { applyTitleDerivedAgentStatus } from './title-derived-agent-status'
import { applyHookAgentStatus, clearHookAgentStatus } from './apply-hook-agent-status'

export function installTerminalAgentStatusBridge(): () => void {
  const disposers: (() => void)[] = []

  disposers.push(
    window.api.terminal.onOscTitle(({ terminalId, rawTitle, normalizedTitle }) => {
      const binding = getTerminalAgentPaneBinding(terminalId)
      if (!binding) return
      useAgentStatusStore.getState().registerLiveTerminal(terminalId)
      useRuntimeTerminalTitlesStore
        .getState()
        .setRuntimePaneTitle(binding.workspaceTabId, binding.paneTabId, normalizedTitle)
      applyTitleDerivedAgentStatus({
        workspaceTabId: binding.workspaceTabId,
        paneTabId: binding.paneTabId,
        rawTitle,
        terminalAgent: binding.terminalAgent,
      })
    }),
  )

  disposers.push(
    window.api.terminal.onPtySpawned(({ terminalId }) => {
      useAgentStatusStore.getState().registerLiveTerminal(terminalId)
    }),
  )

  disposers.push(
    window.api.agentStatus.onSet((payload) => {
      applyHookAgentStatus(payload)
    }),
  )

  disposers.push(
    window.api.agentStatus.onClear(({ paneKey }) => {
      clearHookAgentStatus(paneKey)
    }),
  )

  return () => {
    for (const dispose of disposers) dispose()
  }
}
