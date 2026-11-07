import { isAgentTurnOutcome, type AgentTurnOutcome } from './agent-turn-outcome'
import type { AgentStatusState } from './agent-status-types'
export type AgentMainAgentVerdictSource = {
  state: AgentStatusState
  interrupted?: boolean
  mainAgent?: { state: AgentStatusState; outcome?: AgentTurnOutcome }
}

export function agentMainAgentVerdict(row: AgentMainAgentVerdictSource): AgentTurnOutcome | null {
  if (row.mainAgent && row.mainAgent.state !== 'done') {
    return null
  }
  const outcome = row.mainAgent?.outcome
  if (outcome !== undefined) {
    return isAgentTurnOutcome(outcome) ? outcome : null
  }
  return row.state === 'done' && row.interrupted === true ? 'cancellation' : null
}

export function agentVerdictDisplayMark(
  row: AgentMainAgentVerdictSource,
): 'failed' | 'interrupted' | 'unconfirmed' | null {
  switch (agentMainAgentVerdict(row)) {
    case 'failure':
    case 'interruption':
      return 'failed'
    case 'cancellation':
    case 'superseded':
      return row.state === 'done' ? 'interrupted' : null
    case 'unconfirmed':
      return row.state === 'done' ? 'unconfirmed' : null
    case 'success':
    case null:
      return null
  }
}
