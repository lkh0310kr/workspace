import { describe, expect, it } from 'vitest'
import { editorTreeDirsToReloadForChange } from './editorTreeReload'

describe('editorTreeDirsToReloadForChange', () => {
  it('reloads root and expanded parent dirs', () => {
    const expanded = new Set(['src', 'src/lib'])
    expect(editorTreeDirsToReloadForChange('src/lib/foo.ts', expanded)).toEqual(
      expect.arrayContaining(['', 'src', 'src/lib'])
    )
  })

  it('reloads root for top-level file', () => {
    expect(editorTreeDirsToReloadForChange('README.md', new Set())).toEqual([''])
  })
})
