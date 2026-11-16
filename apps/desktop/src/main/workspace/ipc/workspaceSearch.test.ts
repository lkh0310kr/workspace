import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcHarness = vi.hoisted(() => ({
  handlers: [] as Array<{ channel: string; handler: (...args: unknown[]) => unknown }>,
  registrationOrder: [] as string[]
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHarness.registrationOrder.push(channel)
      ipcHarness.handlers.push({ channel, handler })
    }),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHarness.registrationOrder.push(channel)
      ipcHarness.handlers.push({ channel, handler })
    })
  }
}))

vi.mock('../../wslPaths', () => ({ resolveUserSelectedRootPath: vi.fn((value: string) => value) }))
vi.mock('../../persistence', () => ({ saveConfig: vi.fn() }))

import type { Workspace } from '../../workspace'
import { registerWorkspaceIpc } from './workspace'

function handlerFor(channel: string): (...args: unknown[]) => unknown {
  const handler = ipcHarness.handlers.find((entry) => entry.channel === channel)?.handler
  if (!handler) throw new Error(`IPC handler missing: ${channel}`)
  return handler
}

function createEvent(): {
  sender: { isDestroyed: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> }
} {
  return {
    sender: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn()
    }
  }
}

describe('workspace content-search IPC', () => {
  beforeEach(() => {
    ipcHarness.handlers.length = 0
    ipcHarness.registrationOrder.length = 0
  })

  it('registers search channels once at their existing position', () => {
    registerWorkspaceIpc(() => ({}) as Workspace, vi.fn())

    expect(ipcHarness.registrationOrder).toEqual([
      'workspace:get-state',
      'workspace:add-tab',
      'workspace:close-tab',
      'workspace:select-tab',
      'workspace:rename-tab',
      'workspace:reorder-tabs',
      'workspace:set-tab-layout',
      'workspace:set-tab-root-path',
      'fs:list-dir',
      'fs:read-file',
      'fs:read-file-binary-preview',
      'fs:write-file',
      'fs:write-file-if-unchanged',
      'fs:create-dir',
      'fs:delete-path',
      'fs:rename-path',
      'fs:search-in-files',
      'fs:search-cancel',
      'fs:list-all-files',
      'media:get-url'
    ])
    expect(new Set(ipcHarness.registrationOrder).size).toBe(ipcHarness.registrationOrder.length)
  })

  it('rejects a mutation pinned to the old root before calling the workspace filesystem method', () => {
    let currentRoot = '/workspace-a'
    const renamePath = vi.fn()
    const assertTabRoot = vi.fn((_tabId: number, expectedRootPath?: string) => {
      if (expectedRootPath !== undefined && expectedRootPath !== currentRoot) {
        throw new Error('Workspace root changed; retry the operation in the current workspace.')
      }
    })
    const workspace = { assertTabRoot, renamePath }
    registerWorkspaceIpc(() => workspace as unknown as Workspace, vi.fn())

    // Simulate a root switch after provider preflight and before its mutation request.
    currentRoot = '/workspace-b'
    expect(() =>
      handlerFor('fs:rename-path')(createEvent(), 7, 'notes/a.md', 'notes/b.md', '/workspace-a')
    ).toThrow('Workspace root changed; retry the operation in the current workspace.')
    expect(assertTabRoot).toHaveBeenCalledWith(7, '/workspace-a')
    expect(renamePath).not.toHaveBeenCalled()
  })

  it('rejects a mutation pinned to the old root before calling the workspace filesystem method', () => {
    let currentRoot = '/workspace-a'
    const renamePath = vi.fn()
    const assertTabRoot = vi.fn((_tabId: number, expectedRootPath?: string) => {
      if (expectedRootPath !== undefined && expectedRootPath !== currentRoot) {
        throw new Error('Workspace root changed; retry the operation in the current workspace.')
      }
    })
    const workspace = { assertTabRoot, renamePath }
    registerWorkspaceIpc(() => workspace as unknown as Workspace, vi.fn())

    // Simulates a root switch after provider preflight completed and before its IPC mutation.
    currentRoot = '/workspace-b'
    expect(() =>
      handlerFor('fs:rename-path')(createEvent(), 7, 'notes/a.md', 'notes/b.md', '/workspace-a')
    ).toThrow('Workspace root changed; retry the operation in the current workspace.')
    expect(assertTabRoot).toHaveBeenCalledWith(7, '/workspace-a')
    expect(renamePath).not.toHaveBeenCalled()
  })

  it('cancels a replaced request and removes a request when explicitly cancelled', () => {
    const firstCancel = vi.fn()
    const secondCancel = vi.fn()
    const searchInFiles = vi
      .fn()
      .mockReturnValueOnce({ cancel: firstCancel })
      .mockReturnValueOnce({ cancel: secondCancel })
    const getWorkspace = vi.fn(() => ({ searchInFiles }) as unknown as Workspace)
    registerWorkspaceIpc(getWorkspace, vi.fn())
    const event = createEvent()
    const search = handlerFor('fs:search-in-files')
    const cancel = handlerFor('fs:search-cancel')

    search(event, 'same-id', 7, 'first', { regex: false })
    search(event, 'same-id', 8, 'second', { regex: true })
    expect(firstCancel).toHaveBeenCalledOnce()
    expect(searchInFiles).toHaveBeenNthCalledWith(
      2,
      8,
      'second',
      { regex: true },
      expect.any(Function),
      expect.any(Function)
    )

    cancel(event, 'same-id')
    expect(secondCancel).toHaveBeenCalledOnce()

    search(event, 'same-id', 9, 'third', {})
    expect(secondCancel).toHaveBeenCalledOnce()
    expect(searchInFiles).toHaveBeenCalledTimes(3)
  })

  it('streams results and completion with the request ID and suppresses sends after sender destruction', () => {
    const searchInFiles = vi.fn((_tabId, _query, _options, onResult, onDone) => {
      onResult({ path: 'note.md', matches: [] })
      onDone()
      return { cancel: vi.fn() }
    })
    const getWorkspace = vi.fn(() => ({ searchInFiles }) as unknown as Workspace)
    registerWorkspaceIpc(getWorkspace, vi.fn())
    const event = createEvent()

    handlerFor('fs:search-in-files')(event, 'request-1', 4, 'needle', {})

    expect(getWorkspace).toHaveBeenCalledOnce()
    expect(searchInFiles).toHaveBeenCalledOnce()
    expect(event.sender.send.mock.calls).toEqual([
      ['fs:search-result', 'request-1', { path: 'note.md', matches: [] }],
      ['fs:search-done', 'request-1', undefined]
    ])

    const destroyedEvent = createEvent()
    destroyedEvent.sender.isDestroyed.mockReturnValue(true)
    handlerFor('fs:search-in-files')(destroyedEvent, 'request-2', 4, 'needle', {})
    expect(destroyedEvent.sender.send).not.toHaveBeenCalled()
  })

  it('reports a synchronous search error as a done event', () => {
    const searchInFiles = vi.fn(() => {
      throw new Error('spawn failed synchronously')
    })
    registerWorkspaceIpc(() => ({ searchInFiles }) as unknown as Workspace, vi.fn())
    const event = createEvent()

    handlerFor('fs:search-in-files')(event, 'request-error', 3, 'needle', {})

    expect(event.sender.send).toHaveBeenCalledWith(
      'fs:search-done',
      'request-error',
      'spawn failed synchronously'
    )
  })
})
