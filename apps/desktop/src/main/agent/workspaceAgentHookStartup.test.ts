import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceAfterAgentHookServer } from './workspaceAgentHookStartup'

describe('createWorkspaceAfterAgentHookServer', () => {
  it('waits for the server before constructing workspaces and provides its URL', async () => {
    let resolveServer: ((port: number) => void) | undefined
    const startServer = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveServer = resolve
        })
    )
    const createWorkspace = vi.fn((getStatusUrl: () => string | null) => ({ getStatusUrl }))
    const onStarted = vi.fn()
    const onStartFailed = vi.fn()

    const pendingWorkspace = createWorkspaceAfterAgentHookServer(
      startServer,
      createWorkspace,
      onStarted,
      onStartFailed
    )
    expect(createWorkspace).not.toHaveBeenCalled()

    resolveServer?.(43210)
    const workspace = await pendingWorkspace

    expect(onStarted).toHaveBeenCalledWith(43210)
    expect(onStartFailed).not.toHaveBeenCalled()
    expect(createWorkspace).toHaveBeenCalledOnce()
    expect(workspace.getStatusUrl()).toBe('http://127.0.0.1:43210/status')
  })

  it('continues workspace creation without hook env when the server fails', async () => {
    const error = new Error('listen failed')
    const createWorkspace = vi.fn((getStatusUrl: () => string | null) => ({ getStatusUrl }))
    const onStartFailed = vi.fn()

    const workspace = await createWorkspaceAfterAgentHookServer(
      vi.fn().mockRejectedValue(error),
      createWorkspace,
      vi.fn(),
      onStartFailed
    )

    expect(onStartFailed).toHaveBeenCalledWith(error)
    expect(createWorkspace).toHaveBeenCalledOnce()
    expect(workspace.getStatusUrl()).toBeNull()
  })
})
