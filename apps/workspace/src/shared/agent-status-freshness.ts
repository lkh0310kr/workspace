import type { AgentStatusEntry } from './agent-status-types'

export const AGENT_STATUS_STALE_AFTER_MS = 30 * 60 * 1000

export function agentStatusAuthorityObservedAt(
  entry: Pick<AgentStatusEntry, 'updatedAt' | 'evidenceObservedAt'>,
): number {
  return entry.evidenceObservedAt ?? entry.updatedAt
}

export function agentStatusEvidenceObservedAt(
  entry: Pick<AgentStatusEntry, 'updatedAt' | 'evidenceObservedAt' | 'mirroredEvidenceReceivedAt'>,
): number {
  return entry.mirroredEvidenceReceivedAt ?? agentStatusAuthorityObservedAt(entry)
}

export function isExplicitAgentStatusFresh(
  entry: Pick<
    AgentStatusEntry,
    | 'updatedAt'
    | 'evidenceObservedAt'
    | 'mirroredEvidenceReceivedAt'
    | 'restoredUnconfirmed'
    | 'structuredHostOwned'
    | 'titleDerived'
  >,
  now: number,
  staleAfterMs: number,
): boolean {
  if (entry.titleDerived) {
    return now - agentStatusEvidenceObservedAt(entry) <= staleAfterMs
  }
  return (
    entry.restoredUnconfirmed !== true &&
    (entry.structuredHostOwned === true ||
      now - agentStatusEvidenceObservedAt(entry) <= staleAfterMs)
  )
}
