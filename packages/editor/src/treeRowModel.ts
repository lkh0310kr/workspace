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
  dropTarget,
  expanded,
  kind
}: EditorTreeRowClassInput): string {
  return [
    'editor-tree-item',
    className,
    active && 'is-active',
    selected && 'is-selected',
    multiSelected && 'is-multi-selected',
    cut && 'is-cut',
    isIgnored && 'is-git-ignored',
    dropTarget && 'is-drop-target',
    expanded && 'is-expanded',
    `editor-tree-item--${kind}`
  ]
    .filter(Boolean)
    .join(' ')
}
