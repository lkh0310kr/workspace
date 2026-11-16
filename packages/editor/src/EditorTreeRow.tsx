import React, {
  useRef,
  useEffect,
  type DragEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactNode
} from 'react'
import type { EditorItemKind } from './provider'
import { editorTreeRowClassName } from './treeRowModel'
import styles from './treeView.module.css'

void React

export interface EditorTreeRowProps {
  id: string
  path: string
  name: string
  inlineEdit?: {
    value: string
    ariaLabel: string
    onChange: (value: string) => void
    onCommit: () => boolean | void
    onCancel: () => void
  }
  trailingStatus?: ReactNode
  trailingStatusLabel?: string
  kind: EditorItemKind
  depth: number
  disclosure?: ReactNode
  expandable?: boolean
  expanded?: boolean
  loading?: boolean
  className?: string
  active?: boolean
  selected?: boolean
  multiSelected?: boolean
  cut?: boolean
  isIgnored?: boolean
  dropTarget?: boolean
  tabIndex?: number
  showGuides?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
  onDoubleClick?: MouseEventHandler<HTMLButtonElement>
  onFocus?: React.FocusEventHandler<HTMLButtonElement>
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  onContextMenu?: MouseEventHandler<HTMLButtonElement>
  onDragStart?: DragEventHandler<HTMLButtonElement>
  onDragOver?: DragEventHandler<HTMLButtonElement>
  onDragLeave?: DragEventHandler<HTMLButtonElement>
  onDrop?: DragEventHandler<HTMLButtonElement>
}

/** Shared tree-row structure and interaction semantics for local and PKMS trees. */
export function EditorTreeRow({
  id,
  path,
  name,
  inlineEdit,
  trailingStatus,
  trailingStatusLabel,
  kind,
  depth,
  disclosure,
  expandable = false,
  expanded = false,
  loading = false,
  className,
  active = false,
  selected = false,
  multiSelected = false,
  cut = false,
  isIgnored = false,
  dropTarget = false,
  tabIndex = -1,
  showGuides = false,
  onClick,
  onDoubleClick,
  onFocus,
  onKeyDown,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop
}: EditorTreeRowProps) {
  const inlineEditFinished = useRef(false)
  useEffect(() => {
    if (inlineEdit) inlineEditFinished.current = false
  }, [Boolean(inlineEdit)])
  const classes = editorTreeRowClassName({
    className,
    active,
    selected,
    multiSelected,
    cut,
    isIgnored,
    dropTarget,
    expanded,
    kind
  })

  if (inlineEdit) {
    const commit = () => {
      if (inlineEditFinished.current) return
      const committed = inlineEdit.onCommit()
      if (committed === false) return
      inlineEditFinished.current = true
    }
    const cancel = () => {
      if (inlineEditFinished.current) return
      inlineEditFinished.current = true
      inlineEdit.onCancel()
    }
    return (
      <div
        role="treeitem"
        data-editor-tree-row=""
        data-git-ignored={isIgnored ? '' : undefined}
        data-selected={selected || multiSelected ? '' : undefined}
        data-tree-path={path}
        data-editor-item-id={id}
        aria-level={depth + 1}
        aria-selected={selected || multiSelected}
        aria-expanded={expandable ? expanded : undefined}
        tabIndex={-1}
        className={classes}
        style={{ paddingInlineStart: 8 + depth * 14 }}
      >
        <input
          autoFocus
          type="text"
          aria-label={inlineEdit.ariaLabel}
          className={styles.inlineEdit}
          value={inlineEdit.value}
          onChange={(event) => inlineEdit.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              commit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancel()
            }
          }}
          onBlur={commit}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      role="treeitem"
      data-editor-tree-row=""
      data-git-ignored={isIgnored ? '' : undefined}
      data-selected={selected || multiSelected ? '' : undefined}
      data-tree-path={path}
      data-editor-item-id={id}
      aria-selected={selected || multiSelected}
      aria-description={trailingStatusLabel}
      aria-level={depth + 1}
      aria-expanded={expandable ? expanded : undefined}
      tabIndex={tabIndex}
      draggable={Boolean(onDragStart)}
      className={classes}
      style={{ paddingInlineStart: 8 + depth * 14 }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {showGuides &&
        Array.from({ length: depth }, (_, level) => (
          <span
            key={level}
            className={styles.guide}
            style={{ insetInlineStart: level * 14 + 14 }}
          />
        ))}
      <span
        className={`${styles.disclosure}${expanded ? ` ${styles.disclosureExpanded}` : ''}`}
        aria-hidden="true"
      >
        {loading ? <span className={styles.loading} /> : expandable ? disclosure : null}
      </span>
      <span className={styles.name}>{name}</span>
      {trailingStatus && <span className={styles.trailingStatus}>{trailingStatus}</span>}
    </button>
  )
}
