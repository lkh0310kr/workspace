import type { AgentStatus } from '../../../shared/agent/agent-title-core'
import { detectAgentStatusFromTitle } from '../../../shared/agent/agent-title-status'
import type { TuiAgent } from '../../../shared/agent/tui-agent'
import type { AgentStatusPayload } from '../../../shared/agent-status-types'
import { agentPaneKey, getFreshHookAgentStatus, useAgentStatusStore } from '../store/agentStatusStore'

function mapTitleStatusToPayload(
  titleStatus: AgentStatus,
  title: string,
  terminalAgent?: TuiAgent | null,
): AgentStatusPayload {
  switch (titleStatus) {
    case 'permission':
      return {
        state: 'waiting',
        prompt: title.trim(),
        agentType: terminalAgent ?? undefined,
      }
    case 'working':
      return {
        state: 'working',
        prompt: title.trim(),
        agentType: terminalAgent ?? undefined,
      }
    case 'idle':
      return {
        state: 'done',
        prompt: title.trim(),
        agentType: terminalAgent ?? undefined,
      }
  }
}

export function applyTitleDerivedAgentStatus(args: {
  workspaceTabId: number
  paneTabId: string
  rawTitle: string
  terminalAgent?: TuiAgent | null
}): void {
  const paneKey = agentPaneKey(args.workspaceTabId, args.paneTabId)
  if (getFreshHookAgentStatus(paneKey)) {
    return
  }
  const titleStatus = detectAgentStatusFromTitle(args.rawTitle)
  if (!titleStatus) {
    useAgentStatusStore.getState().dropAgentStatus(paneKey)
    return
  }
  const payload = mapTitleStatusToPayload(titleStatus, args.rawTitle, args.terminalAgent)
  useAgentStatusStore.getState().setAgentStatus(paneKey, payload, {
    workspaceTabId: args.workspaceTabId,
    terminalTitle: args.rawTitle,
    titleDerived: true,
  })
}

export function applyTitleIdleTransition(args: {
  workspaceTabId: number
  paneTabId: string
  title: string
  terminalAgent?: TuiAgent | null
}): void {
  const paneKey = agentPaneKey(args.workspaceTabId, args.paneTabId)
  if (getFreshHookAgentStatus(paneKey)) {
    return
  }
  const payload = mapTitleStatusToPayload('idle', args.title, args.terminalAgent)
  useAgentStatusStore.getState().setAgentStatus(paneKey, payload, {
    workspaceTabId: args.workspaceTabId,
    terminalTitle: args.title,
    titleDerived: true,
  })
  useAgentStatusStore.getState().retainAgentDone(paneKey, args.workspaceTabId)
}

export function clearTitleDerivedOnAgentExit(args: {
  workspaceTabId: number
  paneTabId: string
}): void {
  const paneKey = agentPaneKey(args.workspaceTabId, args.paneTabId)
  if (getFreshHookAgentStatus(paneKey)) {
    return
  }
  useAgentStatusStore.getState().dropAgentStatus(paneKey)
}
