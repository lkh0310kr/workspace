import { describe, expect, it } from 'vitest'
import {
  resolveTerminalTabAgentStatus,
  rollupWorkspaceTabAgentIndicator
} from './workspace-tab-agent-rollup'

describe('resolveTerminalTabAgentStatus', () => {
  it('prefers live title over persisted status', () => {
    expect(
      resolveTerminalTabAgentStatus({
        title: 'Codex - action required',
        terminalAgentStatus: 'idle'
      })
    ).toBe('permission')
  })

  it('falls back to terminalAgent launch with idle when title is not agent-shaped', () => {
    expect(resolveTerminalTabAgentStatus({ terminalAgent: 'claude' })).toBe('idle')
  })
})

describe('rollupWorkspaceTabAgentIndicator', () => {
  it('picks permission over working and idle', () => {
    expect(
      rollupWorkspaceTabAgentIndicator([
        { title: 'Codex working', terminalAgentStatus: 'working' },
        { title: 'Codex - action required', terminalAgentStatus: 'permission' },
        { terminalAgent: 'claude', title: '✳ ready' }
      ])
    ).toBe('permission')
  })

  it('returns null when no terminal shows agent activity', () => {
    expect(rollupWorkspaceTabAgentIndicator([{ title: 'bash' }])).toBe(null)
  })
})
