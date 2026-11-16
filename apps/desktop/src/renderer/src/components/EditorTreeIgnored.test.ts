import { describe, expect, it } from 'vitest'
import { editorTreeRowClassName } from '@workspace/editor'
import styles from '../../../../../../packages/editor/src/treeView.module.css'

describe('EditorTreeRow Git ignore state', () => {
  it('adds a dedicated class to ignored rows without changing row semantics', () => {
    const classNames = editorTreeRowClassName({ kind: 'code', isIgnored: true, selected: true })
    const classes = classNames.split(' ')

    expect(classes).toContain(styles.isGitIgnored)
    expect(classes).toContain(styles.selected)
  })

  it('leaves regular rows without the ignored class', () => {
    const classNames = editorTreeRowClassName({ kind: 'code' })

    expect(classNames.split(' ')).not.toContain(styles.isGitIgnored)
  })
})
