import type { Model, TabNode } from 'flexlayout-react'
import { readPaneGroupConfig } from '../layout/layoutSession'
import type { WorkspaceTerminalPaneSnapshot } from './workspace-tab-status'
import { useAgentStatusStore } from '../store/agentStatusStore'

export function collectWorkspaceTabPaneSnapshots(
  model: Model,
  liveTerminalIds: ReadonlySet<number>,
): { terminals: WorkspaceTerminalPaneSnapshot[]; browserPaneCount: number } {
  const terminals: WorkspaceTerminalPaneSnapshot[] = []
  let browserPaneCount = 0
  model.visitNodes((node) => {
    if (node.getType() !== 'tab') return
    const config = readPaneGroupConfig(node as TabNode)
    for (const tab of config.tabs) {
      if (tab.kind === 'browser') {
        browserPaneCount += 1
      }
      if (tab.kind !== 'terminal') continue
      terminals.push({
        paneTabId: tab.id,
        title: tab.title,
        terminalAgent: tab.terminalAgent,
        terminalId: tab.terminalId,
        live: typeof tab.terminalId === 'number' && liveTerminalIds.has(tab.terminalId),
      })
    }
  })
  return { terminals, browserPaneCount }
}

export function readLiveTerminalIds(): Set<number> {
  return useAgentStatusStore.getState().liveTerminalIds
}
