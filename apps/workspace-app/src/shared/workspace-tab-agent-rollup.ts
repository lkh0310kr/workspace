import type { AgentStatus } from './agent/agent-title-core'
import { detectAgentStatusFromTitle } from './agent/agent-title-status'

/** Highest-priority agent state to show on a workspace tab chip (Orca worktree `status` slot subset). */
export type WorkspaceTabAgentIndicator = AgentStatus

const STATUS_PRIORITY: AgentStatus[] = ['permission', 'working', 'idle']

export type TerminalTabAgentSnapshot = {
  title?: string
  terminalAgent?: unknown
  terminalAgentStatus?: AgentStatus
}

export function resolveTerminalTabAgentStatus(tab: TerminalTabAgentSnapshot): AgentStatus | null {
  const title = tab.title?.trim()
  if (title) {
    const fromTitle = detectAgentStatusFromTitle(title)
    if (fromTitle) return fromTitle
  }
  if (tab.terminalAgentStatus) return tab.terminalAgentStatus
  if (tab.terminalAgent) return 'idle'
  return null
}

export function rollupWorkspaceTabAgentIndicator(
  terminalTabs: readonly TerminalTabAgentSnapshot[],
): WorkspaceTabAgentIndicator | null {
  let best: AgentStatus | null = null
  for (const tab of terminalTabs) {
    const status = resolveTerminalTabAgentStatus(tab)
    if (!status) continue
    if (!best || STATUS_PRIORITY.indexOf(status) < STATUS_PRIORITY.indexOf(best)) {
      best = status
    }
  }
  return best
}

export function workspaceTabAgentIndicatorLabel(indicator: WorkspaceTabAgentIndicator): string {
  switch (indicator) {
    case 'permission':
      return 'Agent needs attention'
    case 'working':
      return 'Agent working'
    case 'idle':
      return 'Agent idle'
  }
}
