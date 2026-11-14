// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model } from 'flexlayout-react'
import type { PaneGroupExplorerChrome } from '../hooks/usePaneGroupExplorerChrome'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./TreeView', () => ({ TreeView: () => null }))
vi.mock('./SearchPanel', () => ({ SearchPanel: () => null }))
vi.mock('../electron', () => ({ onFindInFilesShortcut: () => () => {} }))

import { WorkspaceExplorerSidebar } from './WorkspaceExplorerSidebar'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
})

describe('Workspace Explorer toggle shortcut', () => {
  it('toggles the pane when the physical Backslash key has a different layout character', async () => {
    let open = true
    const setTreeOpen: PaneGroupExplorerChrome['setTreeOpen'] = (next) => {
      open = typeof next === 'function' ? next(open) : next
    }
    const setSidebarMode = vi.fn()
    const chrome: PaneGroupExplorerChrome = {
      treeOpen: open,
      treeWidth: 240,
      sidebarMode: 'explorer',
      setTreeOpen,
      setTreeWidth: vi.fn(),
      setSidebarMode
    }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        createElement(WorkspaceExplorerSidebar, {
          workspaceTabId: 1,
          nodeId: 'pane-1',
          rootPath: '/workspace',
          model: {} as Model,
          paneVisible: true,
          explorerVisible: true,
          isGroupFocused: true,
          explorerCapable: true,
          focusHostRef: { current: null },
          selectedPath: null,
          chrome,
          onOpenFile: vi.fn(),
          onNotifyChanged: vi.fn()
        })
      )
    })

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '₩',
          code: 'Backslash',
          metaKey: true,
          bubbles: true,
          cancelable: true
        })
      )
    })
    expect(open).toBe(false)
    expect(setSidebarMode).toHaveBeenCalledWith('explorer')

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '₩',
          code: 'Backslash',
          metaKey: true,
          bubbles: true,
          cancelable: true
        })
      )
    })
    expect(open).toBe(true)
  })
})
