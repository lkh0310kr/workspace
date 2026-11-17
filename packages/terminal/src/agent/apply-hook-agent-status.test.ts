import { describe, expect, it, beforeEach } from 'vitest'
import { agentStatusStore } from '../state/agentStatusStore'
import { applyHookAgentStatus, clearHookAgentStatus } from './apply-hook-agent-status'

describe('applyHookAgentStatus', () => {
  beforeEach(() => {
    agentStatusStore.setState({
      agentStatusByPaneKey: {},
      retainedAgentsByPaneKey: {},
      agentStatusEpoch: 0,
      liveTerminalIds: new Set()
    })
  })

  it('stores hook rows as non-title-derived', () => {
    applyHookAgentStatus({
      paneKey: '3:tab-terminal-1',
      state: 'blocked',
      prompt: 'approve?',
      agentType: 'claude'
    })
    const entry = agentStatusStore.getState().agentStatusByPaneKey['3:tab-terminal-1']
    expect(entry?.state).toBe('blocked')
    expect(entry?.titleDerived).toBeFalsy()
  })

  it('clears hook rows', () => {
    applyHookAgentStatus({ paneKey: '1:a', state: 'working' })
    clearHookAgentStatus('1:a')
    expect(agentStatusStore.getState().agentStatusByPaneKey['1:a']).toBeUndefined()
  })
})
