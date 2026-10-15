// Orca agent-status-types subset — explicit hook + title-derived rows for workspace chips.

import type { AgentMainAgentStatus } from './main-agent-status'

export const AGENT_STATUS_STATES = ['working', 'blocked', 'waiting', 'done'] as const
export type AgentStatusState = (typeof AGENT_STATUS_STATES)[number]
export type AgentWorkingMode = 'monitoring'

export type AgentStatusPayload = {
  state: AgentStatusState
  prompt?: string
  agentType?: string
  workingMode?: AgentWorkingMode
  interrupted?: boolean
  mainAgent?: AgentMainAgentStatus
}

export type AgentStateHistoryEntry = {
  state: AgentStatusState
  observedAt: number
}

export type AgentStatusEntry = {
  state: AgentStatusState
  workingMode?: AgentWorkingMode
  prompt: string
  updatedAt: number
  evidenceObservedAt?: number
  mirroredEvidenceReceivedAt?: number
  restoredUnconfirmed?: boolean
  structuredHostOwned?: boolean
  stateStartedAt: number
  agentType?: string
  paneKey: string
  workspaceTabId?: number
  terminalTitle?: string
  interrupted?: boolean
  mainAgent?: AgentMainAgentStatus
  /** True when state came from terminal title heuristics, not a hook IPC row. */
  titleDerived?: boolean
  stateHistory: AgentStateHistoryEntry[]
}

export type RetainedAgentEntry = {
  workspaceTabId: number
  entry: AgentStatusEntry
  agentType?: string
}

export function isFreshNonDoneAgentStatus(
  entry: Pick<AgentStatusEntry, 'state' | 'updatedAt' | 'evidenceObservedAt' | 'restoredUnconfirmed' | 'structuredHostOwned'> | null | undefined,
): boolean {
  if (!entry || entry.state === 'done') {
    return false
  }
  return entry.restoredUnconfirmed !== true && entry.structuredHostOwned !== true
}
