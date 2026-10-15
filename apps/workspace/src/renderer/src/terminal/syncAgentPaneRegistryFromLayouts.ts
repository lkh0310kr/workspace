import type { Model } from 'flexlayout-react'
import { collectTerminalPaneTabs } from '../lib/collect-terminal-pane-tabs'
import { useAgentStatusStore } from '../store/agentStatusStore'
import { useRuntimeTerminalTitlesStore } from '../store/runtimeTerminalTitlesStore'
import { registerTerminalAgentPane } from './terminalAgentPaneRegistry'
import { buildAgentStatusPaneKey } from '../../../shared/agent-status-pane-key'
import { applyTitleDerivedAgentStatus } from './title-derived-agent-status'

export function syncAgentPaneRegistryFromLayouts(
  tabs: { id: number }[],
  getModel: (tabId: number) => Model | undefined,
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
        terminalAgent: pane.terminalAgent,
      })
      window.api.agentStatus.registerTerminalPane(
        terminalId,
        buildAgentStatusPaneKey(tab.id, pane.id),
      )
      useAgentStatusStore.getState().registerLiveTerminal(terminalId)
      const title = pane.title?.trim()
      if (title) {
        useRuntimeTerminalTitlesStore.getState().setRuntimePaneTitle(tab.id, pane.id, title)
        applyTitleDerivedAgentStatus({
          workspaceTabId: tab.id,
          paneTabId: pane.id,
          rawTitle: title,
          terminalAgent: pane.terminalAgent,
        })
      }
    }
  }
}
