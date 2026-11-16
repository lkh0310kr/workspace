import { beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnedPtyOptions } = vi.hoisted(() => ({
  spawnedPtyOptions: [] as Array<Record<string, unknown>>
}))

vi.mock('./terminal/pty', () => ({
  Pty: class {
    constructor(options: Record<string, unknown>) {
      spawnedPtyOptions.push(options)
    }
  }
}))

vi.mock('./terminal/ptySession', () => ({
  PtySession: class {
    setOnOutputUtf8(callback: unknown): void {
      if (typeof callback !== 'function') throw new TypeError('output callback required')
    }
  }
}))

import { defaultLayout } from './layout'
import { Workspace } from './workspace'

describe('Workspace agent hook environment', () => {
  beforeEach(() => {
    spawnedPtyOptions.length = 0
  })

  it('sets hook env before spawning a fresh workspace terminal', () => {
    Workspace.withRoot('/tmp/workspace', () => 'http://127.0.0.1:43210/status')

    expect(spawnedPtyOptions).toHaveLength(1)
    expect(spawnedPtyOptions[0].extraEnv).toEqual({
      WORKSPACE_AGENT_HOOK_URL: 'http://127.0.0.1:43210/status',
      WORKSPACE_TERMINAL_ID: '0'
    })
  })

  it('sets hook env before spawning restored workspace terminals', () => {
    const terminalId = 12
    Workspace.fromSnapshot(
      '/tmp/workspace',
      {
        tabs: [
          {
            id: 0,
            title: 'Tab 1',
            layoutJson: defaultLayout(terminalId),
            rootPath: '/tmp/workspace'
          }
        ],
        activeTabId: 0
      },
      () => 'http://127.0.0.1:43210/status'
    )

    expect(spawnedPtyOptions).toHaveLength(1)
    expect(spawnedPtyOptions[0].extraEnv).toEqual({
      WORKSPACE_AGENT_HOOK_URL: 'http://127.0.0.1:43210/status',
      WORKSPACE_TERMINAL_ID: String(terminalId)
    })
  })
})
