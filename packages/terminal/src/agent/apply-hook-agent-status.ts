import type { AgentStatusIpcPayload } from './agent-status-ipc'
import { parseAgentStatusPaneIdentity } from './agent-status-pane-key'
import { agentStatusStore } from '../state/agentStatusStore'

export function applyHookAgentStatus(event: AgentStatusIpcPayload): void {
  const identity = parseAgentStatusPaneIdentity(event.paneKey)
  agentStatusStore.getState().setAgentStatus(
    event.paneKey,
    {
      state: event.state,
      prompt: event.prompt,
      agentType: event.agentType,
      workingMode: event.workingMode
    },
    {
      workspaceTabId: identity?.workspaceTabId ?? event.workspaceTabId,
      titleDerived: false,
      evidenceObservedAt: event.evidenceObservedAt ?? event.receivedAt,
      stateStartedAt: event.stateStartedAt
    }
  )
}

export function clearHookAgentStatus(paneKey: string): void {
  agentStatusStore.getState().dropAgentStatus(paneKey)
}
