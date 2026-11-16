import type { AgentStatus } from '@workspace/terminal/agent/agent-title-core'
import { detectAgentStatusFromTitle } from '@workspace/terminal/agent/agent-title-status'
import { resolveExplicitTerminalTitleAgentType } from '@workspace/terminal/agent/terminal-title-agent-type'
import type { TuiAgent } from '@workspace/terminal/agent/tui-agent'
export function classifyTitleActivity(title: string): AgentStatus | null {
  return detectAgentStatusFromTitle(title)
}

export function resolveCommittedTitleAgentType(title: string): TuiAgent | null {
  return resolveExplicitTerminalTitleAgentType(title)
}
