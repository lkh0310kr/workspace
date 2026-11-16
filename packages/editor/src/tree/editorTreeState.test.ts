import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  ancestorDirPaths,
  loadEditorTreeState,
  resetEditorTreeState,
  resolveEditorTreeScrollTop,
  saveEditorTreeExpanded,
  saveEditorTreeScrollTop
} from './editorTreeState'

function createStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key)
    },
    setItem: (key: string, value: string) => {
      map.set(key, value)
    }
  }
}

describe('ancestorDirPaths', () => {
  it('returns parent folders for a nested file', () => {
    expect(ancestorDirPaths('src/components/TreeView.tsx')).toEqual(['src', 'src/components'])
  })

  it('returns empty for a root-level file', () => {
    expect(ancestorDirPaths('README.md')).toEqual([])
  })
})

describe('Editor tree state', () => {
  const key = 'test-pane-key'
  const root = '/home/me/workspace'

  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
    resetEditorTreeState(key, root)
  })

  it('persists expanded paths and scroll across loads', () => {
    saveEditorTreeExpanded(key, root, ['src', 'src/lib'])
    saveEditorTreeScrollTop(key, root, 120)
    const loaded = loadEditorTreeState(key, root)
    expect(loaded.expanded).toEqual(['src', 'src/lib'])
    expect(loaded.scrollTop).toBe(120)
  })

  it('resets when rootPath changes', () => {
    saveEditorTreeExpanded(key, root, ['src'])
    const other = loadEditorTreeState(key, '/other/root')
    expect(other.expanded).toEqual([])
    expect(other.rootPath).toBe('/other/root')
    const back = loadEditorTreeState(key, root)
    expect(back.expanded).toEqual(['src'])
  })

  it('restores the saved row at its prior offset after rows are inserted above it', () => {
    expect(
      resolveEditorTreeScrollTop(
        { scrollTop: 240, scrollAnchorPath: 'src/target.ts', scrollAnchorOffset: 7 },
        ['new.md', 'src/target.ts', 'tail.md'],
        500,
        30
      )
    ).toBe(37)
  })

  it('falls back to saved pixels when the anchor row disappeared and clamps to the viewport', () => {
    expect(
      resolveEditorTreeScrollTop(
        { scrollTop: 240, scrollAnchorPath: 'removed.ts', scrollAnchorOffset: 7 },
        ['first.md', 'last.md'],
        90,
        30
      )
    ).toBe(90)
  })
})
