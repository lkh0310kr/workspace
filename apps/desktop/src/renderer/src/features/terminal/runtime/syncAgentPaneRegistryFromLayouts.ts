import type { Model } from 'flexlayout-react'
import { collectTerminalPaneTabs } from '@renderer/features/terminal/runtime/collectTerminalPaneTabs'
import { useAgentStatusStore } from '@renderer/features/terminal/state/agentStatusStore'
import { useRuntimeTerminalTitlesStore } from '@renderer/features/terminal/state/runtimeTerminalTitlesStore'
import { registerTerminalAgentPane } from './terminalAgentPaneRegistry'
import { buildAgentStatusPaneKey } from '@workspace/terminal/agent/agent-status-pane-key'
import { applyTitleDerivedAgentStatus } from './title-derived-agent-status'

export function syncAgentPaneRegistryFromLayouts(
  tabs: { id: number }[],
  getModel: (tabId: number) => Model | undefined
): void {
  const seenTerminalIds = new Set<number>()
  for (const tab of tabs) {
    const model = getModel(tab.id)
    if (!model) continue
    for (const pane of collectTerminalPaneTabs(model)) {
      if (typeof pane.terminalId !== 'number') continue
      const terminalId = pane.terminalId
      seenTerminalIds.add(terminalId)
      registerTerminalAgentPane(terminalId, {
        workspaceTabId: tab.id,
        paneTabId: pane.id,
        terminalAgent: pane.terminalAgent
      })
      window.api.agentStatus.registerTerminalPane(
        terminalId,
        buildAgentStatusPaneKey(tab.id, pane.id)
      )
      useAgentStatusStore.getState().registerLiveTerminal(terminalId)
      const title = pane.title?.trim()
      if (title) {
        useRuntimeTerminalTitlesStore.getState().setRuntimePaneTitle(tab.id, pane.id, title)
        applyTitleDerivedAgentStatus({
          workspaceTabId: tab.id,
          paneTabId: pane.id,
          rawTitle: title,
          terminalAgent: pane.terminalAgent
        })
      }
    }
  }
}
