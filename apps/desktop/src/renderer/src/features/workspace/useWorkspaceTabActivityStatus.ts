import { useMemo } from 'react'
import { useStore } from 'zustand'
import type { Model } from 'flexlayout-react'
import { agentStatusStore, runtimeTerminalTitlesStore } from '@workspace/terminal'
import { collectWorkspaceTabPaneSnapshots } from './status/collect-workspace-tab-pane-snapshots'
import { selectWorkspaceAgentActivitySummary } from './status/workspace-agent-activity-summary'
import { resolveWorkspaceTabStatus, type WorkspaceTabStatus } from './status/workspace-tab-status'

export function computeWorkspaceTabActivityStatus(
  workspaceTabId: number,
  getModel: (tabId: number) => Model | undefined
): WorkspaceTabStatus | null {
  const model = getModel(workspaceTabId)
  if (!model) return null
  const agentState = agentStatusStore.getState()
  const runtimeTitles =
    runtimeTerminalTitlesStore.getState().titlesByWorkspaceTab[workspaceTabId] ?? {}
  const { terminals, browserPaneCount } = collectWorkspaceTabPaneSnapshots(
    model,
    agentState.liveTerminalIds
  )
  const hasAgentSignal =
    terminals.some((t) => t.terminalAgent || t.title) ||
    Object.keys(agentState.agentStatusByPaneKey).some((k) => k.startsWith(`${workspaceTabId}:`))
  if (!hasAgentSignal && browserPaneCount === 0) {
    return null
  }
  const summary = selectWorkspaceAgentActivitySummary(
    {
      agentStatusEpoch: agentState.agentStatusEpoch,
      agentStatusByPaneKey: agentState.agentStatusByPaneKey,
      retainedAgentsByPaneKey: agentState.retainedAgentsByPaneKey
    },
    workspaceTabId
  )
  const status = resolveWorkspaceTabStatus({
    terminalPanes: terminals,
    browserPaneCount,
    runtimePaneTitlesByPaneTabId: runtimeTitles,
    agentStatusCoveredPaneTabIds: summary.agentStatusCoveredPaneTabIds,
    stalePaneTabIds: summary.stalePaneTabIds,
    hasPermission: summary.hasPermission,
    hasLiveWorking: summary.hasLiveWorking,
    hasLiveMonitoring: summary.hasLiveMonitoring,
    hasFailed: summary.hasFailed,
    hasInterrupted: summary.hasInterrupted,
    hasUnconfirmed: summary.hasUnconfirmed,
    hasLiveDone: summary.hasLiveDone,
    hasRetainedDone: summary.hasRetainedDone,
    hasRetainedFailed: summary.hasRetainedFailed
  })
  if (status === 'inactive' || status === 'active') {
    return null
  }
  return status
}

export function useWorkspaceTabActivityStatus(
  workspaceTabId: number,
  getModel: (tabId: number) => Model | undefined,
  layoutRevision: number
): WorkspaceTabStatus | null {
  const agentEpoch = useStore(agentStatusStore, (s) => s.agentStatusEpoch)
  const titlesRevision = useStore(runtimeTerminalTitlesStore, (s) => s.revision)

  return useMemo(
    () => computeWorkspaceTabActivityStatus(workspaceTabId, getModel),
    [workspaceTabId, getModel, layoutRevision, agentEpoch, titlesRevision]
  )
}
