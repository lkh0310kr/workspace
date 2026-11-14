import { Fragment, type ReactNode } from 'react'
import type { EditorTreeProjection } from './treeModel'

export interface EditorTreeVirtualListProps<T> {
  projection: EditorTreeProjection<T>
  itemKey: (item: T) => string
  renderItem: (item: T, index: number) => ReactNode
  beforeItems?: ReactNode
  afterItems?: ReactNode
  emptyContent?: ReactNode
  className?: string
}

/** Shared virtual window/spacer renderer for both product file trees. */
export function EditorTreeVirtualList<T>({
  projection,
  itemKey,
  renderItem,
  beforeItems,
  afterItems,
  emptyContent,
  className
}: EditorTreeVirtualListProps<T>) {
  return (
    <div
      className={['editor-tree-virtual-list', className].filter(Boolean).join(' ')}
      role="group"
      style={{ minHeight: projection.totalHeight }}
    >
      {projection.paddingTop > 0 && (
        <div
          aria-hidden="true"
          className="tree-virtual-spacer"
          style={{ height: projection.paddingTop }}
        />
      )}
      {beforeItems}
      {projection.rows.map((item, index) => (
        <Fragment key={itemKey(item)}>{renderItem(item, projection.startIndex + index)}</Fragment>
      ))}
      {afterItems}
      {projection.paddingBottom > 0 && (
        <div
          aria-hidden="true"
          className="tree-virtual-spacer"
          style={{ height: projection.paddingBottom }}
        />
      )}
      {projection.rows.length === 0 && emptyContent}
    </div>
  )
}
