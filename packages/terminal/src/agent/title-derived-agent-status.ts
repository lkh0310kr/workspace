import { agentStatusStore, agentPaneKey, getFreshHookAgentStatus } from '../state/agentStatusStore'
import type { AgentStatusPayload } from './agent-status-types'
import type { AgentStatus } from './agent-title-core'
import { detectAgentStatusFromTitle } from './agent-title-status'
import type { TuiAgent } from './tui-agent'

function mapTitleStatusToPayload(
  titleStatus: AgentStatus,
  title: string,
  terminalAgent?: TuiAgent | null
): AgentStatusPayload {
  switch (titleStatus) {
    case 'permission':
      return { state: 'waiting', prompt: title.trim(), agentType: terminalAgent ?? undefined }
    case 'working':
      return { state: 'working', prompt: title.trim(), agentType: terminalAgent ?? undefined }
    case 'idle':
      return { state: 'done', prompt: title.trim(), agentType: terminalAgent ?? undefined }
  }
}

export function applyTitleDerivedAgentStatus(args: {
  workspaceTabId: number
  paneTabId: string
  rawTitle: string
  terminalAgent?: TuiAgent | null
}): void {
  const paneKey = agentPaneKey(args.workspaceTabId, args.paneTabId)
  if (getFreshHookAgentStatus(paneKey)) return
  const titleStatus = detectAgentStatusFromTitle(args.rawTitle)
  if (!titleStatus) {
    agentStatusStore.getState().dropAgentStatus(paneKey)
    return
  }
  const payload = mapTitleStatusToPayload(titleStatus, args.rawTitle, args.terminalAgent)
  agentStatusStore.getState().setAgentStatus(paneKey, payload, {
    workspaceTabId: args.workspaceTabId,
    terminalTitle: args.rawTitle,
    titleDerived: true
  })
}

export function applyTitleIdleTransition(args: {
  workspaceTabId: number
  paneTabId: string
  title: string
  terminalAgent?: TuiAgent | null
}): void {
  const paneKey = agentPaneKey(args.workspaceTabId, args.paneTabId)
  if (getFreshHookAgentStatus(paneKey)) return
  const payload = mapTitleStatusToPayload('idle', args.title, args.terminalAgent)
  agentStatusStore.getState().setAgentStatus(paneKey, payload, {
    workspaceTabId: args.workspaceTabId,
    terminalTitle: args.title,
    titleDerived: true
  })
  agentStatusStore.getState().retainAgentDone(paneKey, args.workspaceTabId)
}

export function clearTitleDerivedOnAgentExit(args: {
  workspaceTabId: number
  paneTabId: string
}): void {
  const paneKey = agentPaneKey(args.workspaceTabId, args.paneTabId)
  if (getFreshHookAgentStatus(paneKey)) return
  agentStatusStore.getState().dropAgentStatus(paneKey)
}
