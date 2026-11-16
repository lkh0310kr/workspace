import type { AgentStatus } from '@workspace/terminal/agent'
import { detectAgentStatusFromTitle } from '@workspace/terminal/agent'
import { resolveExplicitTerminalTitleAgentType } from '@workspace/terminal/agent'
import type { TuiAgent } from '@workspace/terminal/agent'
export function classifyTitleActivity(title: string): AgentStatus | null {
  return detectAgentStatusFromTitle(title)
}

export function resolveCommittedTitleAgentType(title: string): TuiAgent | null {
  return resolveExplicitTerminalTitleAgentType(title)
}
