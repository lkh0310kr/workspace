import type { AgentStatus } from '@workspace/terminal/agent'
import { detectAgentStatusFromTitle } from '@workspace/terminal/agent'
import type { TuiAgent } from '@workspace/terminal/agent'
import type { AgentStatusPayload } from '@workspace/terminal/agent'
import {
  agentPaneKey,
  getFreshHookAgentStatus,
  useAgentStatusStore
} from '@workspace/terminal'

function mapTitleStatusToPayload(
  titleStatus: AgentStatus,
  title: string,
  terminalAgent?: TuiAgent | null
): AgentStatusPayload {
  switch (titleStatus) {
    case 'permission':
      return {
        state: 'waiting',
        prompt: title.trim(),
        agentType: terminalAgent ?? undefined
      }
    case 'working':
      return {
        state: 'working',
        prompt: title.trim(),
        agentType: terminalAgent ?? undefined
      }
    case 'idle':
      return {
        state: 'done',
        prompt: title.trim(),
        agentType: terminalAgent ?? undefined
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
  if (getFreshHookAgentStatus(paneKey)) {
    return
  }
  const payload = mapTitleStatusToPayload('idle', args.title, args.terminalAgent)
  useAgentStatusStore.getState().setAgentStatus(paneKey, payload, {
    workspaceTabId: args.workspaceTabId,
    terminalTitle: args.title,
    titleDerived: true
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
