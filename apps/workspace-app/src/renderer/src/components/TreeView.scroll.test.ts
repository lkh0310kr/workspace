// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorTreeItem } from '@workspace/editor'
import {
  resetExplorerTreeState,
  saveExplorerScrollAnchor,
  saveExplorerScrollTop
} from '../explorer/explorerState'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const { provider, release } = vi.hoisted(() => ({
  provider: {
    capabilities: {
      operations: new Set(),
      searchNames: false,
      searchContents: false,
      replaceContents: false,
      multiSelect: false,
      dragMove: false,
      codeLanguages: new Set(),
      collaborativeDocuments: false
    },
    listChildren: vi.fn(),
    subscribeTree: vi.fn(() => () => {}),
    pathForItemId: vi.fn(() => null)
  },
  release: vi.fn()
}))

vi.mock('../editor/localEditorProvider', () => ({
  acquireLocalEditorProvider: () => ({ provider, release })
}))

vi.mock('@workspace/editor', async () => {
  const React = await import('react')
  return {
    EDITOR_TREE_DRAG_MIME_TYPE: 'application/x-workspace-editor-tree-paths',
    EDITOR_TREE_ROW_HEIGHT: 27,
    EditorTreeView: ({
      rootRef,
      projection
    }: {
      rootRef: { current: HTMLElement | null }
      projection: { rows: Array<{ path: string }> }
    }) =>
      React.createElement(
        'div',
        { ref: rootRef },
        ...projection.rows.map((row) =>
          React.createElement('div', { key: row.path, 'data-tree-path': row.path })
        )
      ),
    confirmDirtyEditorDocumentsInPaths: vi.fn(async () => true),
    editorSupportsOperation: () => false,
    editorTreeItemLabel: (name: string) => name,
    editorTreeSelectionRoots: (paths: string[]) => paths,
    flattenEditorTree: (
      branches: Map<string, Array<{ path: string; name: string; directory: boolean }>>,
      _expanded: Set<string>
    ) => (branches.get('') ?? []).map((item) => ({ item, depth: 0 })),
    isEditorProviderError: () => false,
    nextEditorItemNameInDirectory: vi.fn(),
    projectEditorTreeRows: (rows: unknown[]) => ({
      rows,
      startIndex: 0,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: rows.length * 27
    }),
    resolveEditorTreeDirectory: async () => null,
    resolveEditorTreePath: async () => null,
    useEditorTreeSelection: () => ({
      selectedPaths: new Set<string>(),
      setSelectedPaths: vi.fn(),
      anchorPath: null,
      setAnchorPath: vi.fn(),
      focusedPath: null,
      setFocusedPath: vi.fn()
    })
  }
})

import { TreeView } from './TreeView'

let root: Root | null = null
let host: HTMLDivElement | null = null
let scroller: HTMLDivElement | null = null

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  const items: EditorTreeItem[] = Array.from({ length: 100 }, (_, index) => ({
    providerId: 'test-provider',
    itemId: `item-${index}`,
    parentId: null,
    path: `file-${String(index).padStart(3, '0')}.md`,
    name: `file-${String(index).padStart(3, '0')}.md`,
    kind: 'markdown',
    readOnly: false
  }))
  provider.listChildren.mockImplementation(async (parentId: string | null) =>
    parentId === null ? items : []
  )
  host = document.createElement('div')
  scroller = document.createElement('div')
  document.body.append(host, scroller)
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 100 })
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2700 })
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  host?.remove()
  scroller?.remove()
  host = null
  scroller = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('TreeView scroll restoration', () => {
  const rootPath = '/workspace'
  const stateKey = 'test-workspace:pane-1'

  const renderTree = (selectedPath: string | null) =>
    createElement(TreeView, {
      tabId: 1,
      rootPath,
      explorerStateKey: stateKey,
      scrollContainerRef: { current: scroller },
      paneVisible: true,
      explorerModeActive: true,
      selectedPath,
      onOpenFile: vi.fn()
    })

  it('restores scroll after reopen and keeps it when the active file changes', async () => {
    resetExplorerTreeState(stateKey, rootPath)
    saveExplorerScrollTop(stateKey, rootPath, 543)
    saveExplorerScrollAnchor(stateKey, rootPath, 'file-020.md', 3)
    root = createRoot(host!)

    await act(async () => root?.render(renderTree(null)))
    await vi.waitFor(() => expect(scroller?.scrollTop).toBe(543))

    await act(async () => root?.render(renderTree('file-090.md')))
    expect(scroller?.scrollTop).toBe(543)

    await act(async () => root?.unmount())
    root = createRoot(host!)
    scroller!.scrollTop = 0

    await act(async () => root?.render(renderTree('file-090.md')))
    await vi.waitFor(() => expect(scroller?.scrollTop).toBe(543))
    expect(scroller?.scrollTop).toBe(543)
  })
})
