import { describe, expect, it } from 'vitest'
import { projectVisibleEditorTreeRows } from './editorTreeProjection'
import { EDITOR_TREE_ROW_HEIGHT } from './treeModel'

describe('projectVisibleEditorTreeRows', () => {
  const rows = Array.from({ length: 200 }, (_, i) => i)

  it('returns a window around the scroll position', () => {
    const { rows: visible, paddingTop, startIndex } = projectVisibleEditorTreeRows(rows, 480, 240)
    expect(startIndex).toBeGreaterThan(0)
    expect(visible.length).toBeLessThan(rows.length)
    expect(paddingTop).toBe(startIndex * EDITOR_TREE_ROW_HEIGHT)
  })
})
