import type { AgentStatus } from '../../../shared/agent/agent-title-core'
import { detectAgentStatusFromTitle } from '../../../shared/agent/agent-title-status'
import { resolveExplicitTerminalTitleAgentType } from '../../../shared/agent/terminal-title-agent-type'
import type { TuiAgent } from '../../../shared/agent/tui-agent'
export function classifyTitleActivity(title: string): AgentStatus | null {
  return detectAgentStatusFromTitle(title)
}

export function resolveCommittedTitleAgentType(title: string): TuiAgent | null {
  return resolveExplicitTerminalTitleAgentType(title)
}
