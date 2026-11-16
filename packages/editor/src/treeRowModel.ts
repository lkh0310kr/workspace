import styles from './treeView.module.css'
import type { EditorItemKind } from './provider'

export interface EditorTreeRowClassInput {
  className?: string
  active?: boolean
  selected?: boolean
  multiSelected?: boolean
  cut?: boolean
  isIgnored?: boolean
  dropTarget?: boolean
  expanded?: boolean
  kind: EditorItemKind
}

export function editorTreeRowClassName({
  className,
  active,
  selected,
  multiSelected,
  cut,
  isIgnored,
  dropTarget
}: EditorTreeRowClassInput): string {
  return [
    styles.item,
    className,
    active && styles.active,
    selected && styles.selected,
    multiSelected && styles.multiSelected,
    cut && styles.cut,
    isIgnored && styles.isGitIgnored,
    dropTarget && styles.dropTarget
  ]
    .filter(Boolean)
    .join(' ')
}
