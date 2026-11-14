import { describe, expect, it } from 'vitest'
import { editorTreeRowClassName } from '@workspace/editor/tree-row'

describe('EditorTreeRow Git ignore state', () => {
  it('adds a dedicated class to ignored rows without changing row semantics', () => {
    const className = editorTreeRowClassName({ kind: 'code', isIgnored: true, selected: true })

    expect(className.split(' ')).toContain('is-git-ignored')
    expect(className.split(' ')).toContain('is-selected')
  })

  it('leaves regular rows without the ignored class', () => {
    const className = editorTreeRowClassName({ kind: 'code' })

    expect(className.split(' ')).not.toContain('is-git-ignored')
  })
})
