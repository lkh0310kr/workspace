// Port of ref-proj/orca worktree-agent-activity-summary.ts (workspace tab scope).

import type { AgentStatusEntry } from '@workspace/terminal/agent'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  agentStatusEvidenceObservedAt,
  isExplicitAgentStatusFresh
} from '@workspace/terminal/agent'
import { parseAgentStatusPaneIdentity } from '@workspace/terminal/agent'
import { agentVerdictDisplayMark } from '@workspace/terminal/agent'
import { applyAgentPaneActivityFlags } from './agent-pane-activity-flags'

export type WorkspaceAgentActivitySummary = {
  hasPermission: boolean
  hasLiveWorking: boolean
  hasLiveMonitoring: boolean
  hasFailed: boolean
  hasInterrupted: boolean
  hasUnconfirmed: boolean
  hasLiveDone: boolean
  hasRetainedDone: boolean
  hasRetainedFailed: boolean
  agentStatusCoveredPaneTabIds: ReadonlySet<string>
  stalePaneTabIds: ReadonlySet<string>
}

const EMPTY_SET = new Set<string>()

const EMPTY_SUMMARY: WorkspaceAgentActivitySummary = {
  hasPermission: false,
  hasLiveWorking: false,
  hasLiveMonitoring: false,
  hasFailed: false,
  hasInterrupted: false,
  hasUnconfirmed: false,
  hasLiveDone: false,
  hasRetainedDone: false,
  hasRetainedFailed: false,
  agentStatusCoveredPaneTabIds: EMPTY_SET,
  stalePaneTabIds: EMPTY_SET
}

export type WorkspaceAgentActivityInput = {
  agentStatusEpoch: number
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
  retainedAgentsByPaneKey: Record<string, { workspaceTabId: number; entry: AgentStatusEntry }>
}

let cache: {
  epoch: number
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
  retainedAgentsByPaneKey: Record<string, { workspaceTabId: number; entry: AgentStatusEntry }>
  validUntil: number
  summaries: Map<number, WorkspaceAgentActivitySummary>
} | null = null

export function selectWorkspaceAgentActivitySummary(
  state: WorkspaceAgentActivityInput,
  workspaceTabId: number
): WorkspaceAgentActivitySummary {
  return getSummaries(state).get(workspaceTabId) ?? EMPTY_SUMMARY
}

function getSummaries(
  state: WorkspaceAgentActivityInput
): Map<number, WorkspaceAgentActivitySummary> {
  const now = Date.now()
  if (
    cache &&
    cache.epoch === state.agentStatusEpoch &&
    cache.agentStatusByPaneKey === state.agentStatusByPaneKey &&
    cache.retainedAgentsByPaneKey === state.retainedAgentsByPaneKey &&
    now < cache.validUntil
  ) {
    return cache.summaries
  }

  const summaries = new Map<number, WorkspaceAgentActivitySummary>()
  const summaryFor = (id: number): WorkspaceAgentActivitySummary => {
    let s = summaries.get(id)
    if (!s) {
      s = {
        ...EMPTY_SUMMARY,
        agentStatusCoveredPaneTabIds: new Set(),
        stalePaneTabIds: new Set()
      }
      summaries.set(id, s)
    }
    return s
  }

  let validUntil = Number.POSITIVE_INFINITY
  for (const [, entry] of Object.entries(state.agentStatusByPaneKey)) {
    const identity = parseAgentStatusPaneIdentity(entry.paneKey)
    if (!identity || identity.workspaceTabId === undefined) continue
    const summary = summaryFor(identity.workspaceTabId)
    const covered = summary.agentStatusCoveredPaneTabIds as Set<string>
    const stale = summary.stalePaneTabIds as Set<string>
    if (entry.restoredUnconfirmed) {
      covered.add(identity.paneTabId)
      continue
    }
    if (!isExplicitAgentStatusFresh(entry, now, AGENT_STATUS_STALE_AFTER_MS)) {
      stale.add(identity.paneTabId)
      continue
    }
    if (entry.titleDerived || entry.structuredHostOwned !== true) {
      validUntil = Math.min(
        validUntil,
        agentStatusEvidenceObservedAt(entry) + AGENT_STATUS_STALE_AFTER_MS + 1
      )
    }
    covered.add(identity.paneTabId)
    applyAgentPaneActivityFlags(summary, entry)
  }

  for (const retained of Object.values(state.retainedAgentsByPaneKey)) {
    const summary = summaryFor(retained.workspaceTabId)
    if (agentVerdictDisplayMark(retained.entry) === 'failed') {
      summary.hasRetainedFailed = true
    } else {
      summary.hasRetainedDone = true
    }
    const identity = parseAgentStatusPaneIdentity(retained.entry.paneKey)
    if (identity) {
      ;(summary.agentStatusCoveredPaneTabIds as Set<string>).add(identity.paneTabId)
    }
  }

  cache = {
    epoch: state.agentStatusEpoch,
    agentStatusByPaneKey: state.agentStatusByPaneKey,
    retainedAgentsByPaneKey: state.retainedAgentsByPaneKey,
    validUntil,
    summaries
  }
  return summaries
}
