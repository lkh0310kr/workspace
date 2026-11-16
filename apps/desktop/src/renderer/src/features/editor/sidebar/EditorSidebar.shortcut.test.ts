// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model } from 'flexlayout-react'
import type { EditorSidebarState } from '@workspace/editor'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true


vi.mock('./TreeView', () => ({ TreeView: () => null }))
vi.mock('./SearchPanel', () => ({ SearchPanel: () => null }))
vi.mock('@workspace/editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@workspace/editor')>()),
  EditorTreeResizeHandle: () => null
}))
import { EditorSidebar } from './EditorSidebar'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
})

describe('Editor tree toggle shortcut', () => {
  it('toggles the pane when the physical Backslash key has a different layout character', async () => {
    let open = true
    const setTreeOpen: EditorSidebarState['setTreeOpen'] = (next) => {
      open = typeof next === 'function' ? next(open) : next
    }
    const setSidebarMode = vi.fn()
    const chrome: EditorSidebarState = {
      treeOpen: open,
      treeWidth: 240,
      sidebarMode: 'tree',
      setTreeOpen,
      setTreeWidth: vi.fn(),
      setSidebarMode
    }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        createElement(EditorSidebar, {
          workspaceTabId: 1,
          nodeId: 'pane-1',
          rootPath: '/workspace',
          model: {} as Model,
          paneVisible: true,
          editorSidebarVisible: true,
          isGroupFocused: true,
          supportsEditorTree: true,
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
    expect(setSidebarMode).toHaveBeenCalledWith('tree')

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

  it('ignores editor workspace shortcuts when a non-editor pane is focused', async () => {
    let open = false
    const setTreeOpen: EditorSidebarState['setTreeOpen'] = (next) => {
      open = typeof next === 'function' ? next(open) : next
    }
    const setSidebarMode = vi.fn()
    const chrome: EditorSidebarState = {
      treeOpen: open,
      treeWidth: 240,
      sidebarMode: 'tree',
      setTreeOpen,
      setTreeWidth: vi.fn(),
      setSidebarMode
    }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        createElement(EditorSidebar, {
          workspaceTabId: 1,
          nodeId: 'pane-browser',
          rootPath: '/workspace',
          model: {} as Model,
          paneVisible: true,
          editorSidebarVisible: false,
          isGroupFocused: true,
          supportsEditorTree: false,
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
          key: 'f',
          code: 'KeyF',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true
        })
      )
    })
    expect(setSidebarMode).not.toHaveBeenCalled()
    expect(open).toBe(false)

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
    expect(setSidebarMode).not.toHaveBeenCalled()
    expect(open).toBe(false)
  })
})
