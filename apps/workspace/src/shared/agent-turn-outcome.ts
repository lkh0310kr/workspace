export const AGENT_TURN_OUTCOMES = [
  'success',
  'failure',
  'cancellation',
  'superseded',
  'interruption',
  'unconfirmed',
] as const
export type AgentTurnOutcome = (typeof AGENT_TURN_OUTCOMES)[number]

export function isAgentTurnOutcome(value: unknown): value is AgentTurnOutcome {
  return AGENT_TURN_OUTCOMES.some((known) => known === value)
}
