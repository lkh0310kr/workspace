import { create } from 'zustand'
import type { AgentStatusEntry, AgentStatusPayload } from '../../../shared/agent-status-types'
import { isExplicitAgentStatusFresh, AGENT_STATUS_STALE_AFTER_MS } from '../../../shared/agent-status-freshness'
import { buildAgentStatusPaneKey } from '../../../shared/agent-status-pane-key'

type Retained = { workspaceTabId: number; entry: AgentStatusEntry }

type State = {
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
  retainedAgentsByPaneKey: Record<string, Retained>
  agentStatusEpoch: number
  liveTerminalIds: Set<number>
}

type Actions = {
  setAgentStatus: (
    paneKey: string,
    payload: AgentStatusPayload,
    meta?: {
      workspaceTabId?: number
      terminalTitle?: string
      titleDerived?: boolean
      evidenceObservedAt?: number
      stateStartedAt?: number
    },
  ) => void
  dropAgentStatus: (paneKey: string) => void
  retainAgentDone: (paneKey: string, workspaceTabId: number) => void
  registerLiveTerminal: (terminalId: number) => void
  unregisterLiveTerminal: (terminalId: number) => void
}

function bumpEntry(
  paneKey: string,
  payload: AgentStatusPayload,
  meta: {
    workspaceTabId?: number
    terminalTitle?: string
    titleDerived?: boolean
    stateStartedAt?: number
    evidenceObservedAt?: number
  },
  previous: AgentStatusEntry | undefined,
): AgentStatusEntry {
  const now = Date.now()
  const stateStartedAt =
    meta.stateStartedAt ??
    (previous?.state === payload.state ? (previous.stateStartedAt ?? now) : now)
  return {
    state: payload.state,
    workingMode: payload.workingMode,
    prompt: payload.prompt?.trim() ?? previous?.prompt ?? '',
    updatedAt: now,
    evidenceObservedAt: meta.evidenceObservedAt ?? now,
    stateStartedAt,
    agentType: payload.agentType ?? previous?.agentType,
    paneKey,
    workspaceTabId: meta.workspaceTabId,
    terminalTitle: meta.terminalTitle,
    interrupted: payload.interrupted,
    mainAgent: payload.mainAgent,
    titleDerived: meta.titleDerived ?? false,
    stateHistory: previous?.stateHistory ?? [],
  }
}

export const useAgentStatusStore = create<State & Actions>((set, get) => ({
  agentStatusByPaneKey: {},
  retainedAgentsByPaneKey: {},
  agentStatusEpoch: 0,
  liveTerminalIds: new Set(),

  setAgentStatus(paneKey, payload, meta = {}) {
    set((state) => {
      const previous = state.agentStatusByPaneKey[paneKey]
      const entry = bumpEntry(paneKey, payload, meta, previous)
      return {
        agentStatusByPaneKey: { ...state.agentStatusByPaneKey, [paneKey]: entry },
        agentStatusEpoch: state.agentStatusEpoch + 1,
      }
    })
  },

  dropAgentStatus(paneKey) {
    set((state) => {
      if (!state.agentStatusByPaneKey[paneKey]) return state
      const next = { ...state.agentStatusByPaneKey }
      delete next[paneKey]
      return { agentStatusByPaneKey: next, agentStatusEpoch: state.agentStatusEpoch + 1 }
    })
  },

  retainAgentDone(paneKey, workspaceTabId) {
    const entry = get().agentStatusByPaneKey[paneKey]
    if (!entry || entry.state !== 'done') return
    set((state) => ({
      retainedAgentsByPaneKey: {
        ...state.retainedAgentsByPaneKey,
        [paneKey]: { workspaceTabId, entry },
      },
      agentStatusByPaneKey: (() => {
        const next = { ...state.agentStatusByPaneKey }
        delete next[paneKey]
        return next
      })(),
      agentStatusEpoch: state.agentStatusEpoch + 1,
    }))
  },

  registerLiveTerminal(terminalId) {
    set((state) => {
      if (state.liveTerminalIds.has(terminalId)) return state
      const next = new Set(state.liveTerminalIds)
      next.add(terminalId)
      return { liveTerminalIds: next }
    })
  },

  unregisterLiveTerminal(terminalId) {
    set((state) => {
      if (!state.liveTerminalIds.has(terminalId)) return state
      const next = new Set(state.liveTerminalIds)
      next.delete(terminalId)
      return { liveTerminalIds: next }
    })
  },
}))

export function getFreshHookAgentStatus(paneKey: string): AgentStatusEntry | null {
  const entry = useAgentStatusStore.getState().agentStatusByPaneKey[paneKey]
  if (!entry || entry.titleDerived) return null
  if (!isExplicitAgentStatusFresh(entry, Date.now(), AGENT_STATUS_STALE_AFTER_MS)) return null
  return entry
}

export function agentPaneKey(workspaceTabId: number, paneTabId: string): string {
  return buildAgentStatusPaneKey(workspaceTabId, paneTabId)
}
