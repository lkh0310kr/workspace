import type { AgentStatusState } from './agent-status-types'
import type { AgentTurnOutcome } from './agent-turn-outcome'

export type AgentMainAgentStatus = {
  state: AgentStatusState
  outcome?: AgentTurnOutcome
  stopping?: true
  stateStartedAt: number
}
