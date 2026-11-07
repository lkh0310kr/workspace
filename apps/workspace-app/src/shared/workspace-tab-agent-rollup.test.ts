import { describe, expect, it } from 'vitest'
import {
  resolveTerminalTabAgentStatus,
  rollupWorkspaceTabAgentIndicator
} from './workspace-tab-agent-rollup'
import { GEMINI_PERMISSION, GEMINI_WORKING } from './agent/agent-title-core'

describe('resolveTerminalTabAgentStatus', () => {
  it('prefers live title over persisted status', () => {
    expect(
      resolveTerminalTabAgentStatus({
        title: `${GEMINI_PERMISSION} Gemini`,
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
        { title: `Codex ${GEMINI_WORKING}` },
        { title: `${GEMINI_PERMISSION} Gemini` },
        { terminalAgent: 'claude', title: '✳ ready' }
      ])
    ).toBe('permission')
  })

  it('returns null when no terminal shows agent activity', () => {
    expect(rollupWorkspaceTabAgentIndicator([{ title: 'bash' }])).toBe(null)
  })
})
