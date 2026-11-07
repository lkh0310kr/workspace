import type { AgentStatusIpcPayload } from '../../../shared/agent-status-ipc'
import { parseAgentStatusPaneIdentity } from '../../../shared/agent-status-pane-key'
import { useAgentStatusStore } from '../store/agentStatusStore'

export function applyHookAgentStatus(event: AgentStatusIpcPayload): void {
  const identity = parseAgentStatusPaneIdentity(event.paneKey)
  useAgentStatusStore.getState().setAgentStatus(
    event.paneKey,
    {
      state: event.state,
      prompt: event.prompt,
      agentType: event.agentType,
      workingMode: event.workingMode,
    },
    {
      workspaceTabId: identity?.workspaceTabId ?? event.workspaceTabId,
      titleDerived: false,
      evidenceObservedAt: event.evidenceObservedAt ?? event.receivedAt,
      stateStartedAt: event.stateStartedAt,
    },
  )
}

export function clearHookAgentStatus(paneKey: string): void {
  useAgentStatusStore.getState().dropAgentStatus(paneKey)
}
