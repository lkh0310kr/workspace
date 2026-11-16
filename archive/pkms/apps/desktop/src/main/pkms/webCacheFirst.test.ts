/** @vitest-environment jsdom */
import React, { act } from '../../../../../node_modules/react'
import { createRoot, type Root } from '../../../../../node_modules/react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileRecord, Workspace } from '../../../../../packages/pkms-client/src/domain/types'

const cacheRuntime = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn()
}))

vi.mock('../../../../../packages/pkms-client/src/client/workspaceTreeCache', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    readWorkspaceTree: cacheRuntime.read,
    writeWorkspaceTree: cacheRuntime.write
  }
})

import { useWorkspaceDirectory } from '../../../../../packages/pkms-client/src/features/files/useWorkspaceDirectory'

type DirectoryApi = Parameters<typeof useWorkspaceDirectory>[1]

describe('web workspace tree cache-first restore', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeEach(() => {
    cacheRuntime.read.mockReset()
    cacheRuntime.write.mockReset().mockResolvedValue(undefined)
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = null
    container?.remove()
    container = null
    localStorage.clear()
  })

  it('shows the cached tree before a slow refresh and replaces it with the latest directory listing', async () => {
    const workspace: Workspace = {
      id: 'workspace-cache-first',
      repository: 'owner/repo',
      branch: 'main',
      revision: 1,
      githubStatus: 'synced'
    }
    const cached: FileRecord = { id: 'cached', path: 'cached.md', kind: 'markdown', revision: 1 }
    const remote: FileRecord = { id: 'remote', path: 'remote.md', kind: 'markdown', revision: 2 }
    cacheRuntime.read.mockResolvedValue({
      workspaceId: workspace.id,
      files: [cached],
      loadedFolders: [''],
      savedAt: Date.now()
    })
    let completeRootRequest!: (response: { files: FileRecord[] }) => void
    const api = vi.fn(
      <T = unknown>() =>
        new Promise<{ files: FileRecord[] }>((resolve) => {
          completeRootRequest = resolve
        }).then((response) => response as T)
    ) as unknown as DirectoryApi
    const state: { current: ReturnType<typeof useWorkspaceDirectory> | null } = { current: null }
    function Harness() {
      state.current = useWorkspaceDirectory(workspace, api, vi.fn())
      return React.createElement('div')
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(React.createElement(Harness)))
    localStorage.setItem(
      `pkms:tree:${workspace.id}`,
      JSON.stringify({ expanded: [], currentFolder: '', scrollTop: 41 })
    )

    let restoredScrollTop: number | null = null
    await act(async () => {
      restoredScrollTop = await state.current?.restoreWorkspaceTree(() => true) ?? null
    })

    expect(restoredScrollTop).toBe(41)
    expect(state.current?.files.map((file) => file.id)).toEqual(['cached'])
    expect(state.current?.loadingFolder).toBe(false)
    expect(api).toHaveBeenCalledTimes(1)

    await act(async () => {
      completeRootRequest({ files: [remote] })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(state.current?.files.map((file) => file.id)).toEqual(['remote'])
    expect(state.current?.loadedFolders.has('')).toBe(true)
  })
})
