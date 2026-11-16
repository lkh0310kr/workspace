import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '@workspace/terminal/agent/agent-status-types'
import { AGENT_STATUS_STALE_AFTER_MS } from '@workspace/terminal/agent/agent-status-freshness'
import {
  selectWorkspaceAgentActivitySummary,
  type WorkspaceAgentActivityInput
} from './workspace-agent-activity-summary'

function makeEntry(paneKey: string, overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: Date.now(),
    stateStartedAt: Date.now(),
    paneKey,
    stateHistory: [],
    ...overrides
  }
}

function makeState(entry: AgentStatusEntry): WorkspaceAgentActivityInput {
  return {
    agentStatusEpoch: 1,
    agentStatusByPaneKey: { [entry.paneKey]: entry },
    retainedAgentsByPaneKey: {}
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('selectWorkspaceAgentActivitySummary', () => {
  it('recomputes the same inputs when explicit evidence crosses its freshness limit', () => {
    const observedAt = 1_000_000
    vi.useFakeTimers()
    vi.setSystemTime(observedAt)
    const state = makeState(makeEntry('4:pane-a', { updatedAt: observedAt }))

    const fresh = selectWorkspaceAgentActivitySummary(state, 4)
    expect(fresh.hasLiveWorking).toBe(true)
    expect(fresh.stalePaneTabIds.has('pane-a')).toBe(false)

    vi.setSystemTime(observedAt + AGENT_STATUS_STALE_AFTER_MS + 1)
    const stale = selectWorkspaceAgentActivitySummary(state, 4)
    expect(stale.hasLiveWorking).toBe(false)
    expect(stale.stalePaneTabIds.has('pane-a')).toBe(true)
  })

  it('uses mirrored observation time for title-derived freshness', () => {
    const receivedAt = 2_000_000
    vi.useFakeTimers()
    vi.setSystemTime(receivedAt)
    const state = makeState(
      makeEntry('5:pane-b', {
        titleDerived: true,
        updatedAt: receivedAt - AGENT_STATUS_STALE_AFTER_MS * 2,
        mirroredEvidenceReceivedAt: receivedAt
      })
    )

    expect(selectWorkspaceAgentActivitySummary(state, 5).hasLiveWorking).toBe(true)
    vi.setSystemTime(receivedAt + AGENT_STATUS_STALE_AFTER_MS + 1)
    const stale = selectWorkspaceAgentActivitySummary(state, 5)
    expect(stale.hasLiveWorking).toBe(false)
    expect(stale.stalePaneTabIds.has('pane-b')).toBe(true)
  })

  it('preserves restored and structured-host freshness rules', () => {
    const now = 3_000_000
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const restored = makeEntry('6:restored', {
      restoredUnconfirmed: true,
      updatedAt: now
    })
    const hostOwned = makeEntry('6:host', {
      structuredHostOwned: true,
      updatedAt: now - AGENT_STATUS_STALE_AFTER_MS * 2
    })
    const state: WorkspaceAgentActivityInput = {
      agentStatusEpoch: 1,
      agentStatusByPaneKey: {
        [restored.paneKey]: restored,
        [hostOwned.paneKey]: hostOwned
      },
      retainedAgentsByPaneKey: {}
    }

    const summary = selectWorkspaceAgentActivitySummary(state, 6)
    expect(summary.agentStatusCoveredPaneTabIds.has('restored')).toBe(true)
    expect(summary.stalePaneTabIds.has('restored')).toBe(false)
    expect(summary.hasLiveWorking).toBe(true)
    expect(summary.stalePaneTabIds.has('host')).toBe(false)
  })
})
