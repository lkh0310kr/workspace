import type { AgentStatusState, AgentWorkingMode } from './agent-status-types'

/** Payload forwarded main → renderer on `agentStatus:set` (Orca subset). */
export type AgentStatusIpcPayload = {
  paneKey: string
  state: AgentStatusState
  prompt?: string
  agentType?: string
  workingMode?: AgentWorkingMode
  receivedAt?: number
  evidenceObservedAt?: number
  stateStartedAt?: number
  workspaceTabId?: number
}

export type AgentStatusClearIpcPayload = {
  paneKey: string
}
