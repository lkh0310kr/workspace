import React, { type CSSProperties, type ReactNode, type RefObject } from 'react'
import { EditorTreeView, type EditorTreeViewProps } from './EditorTreeView'
import styles from './treeView.module.css'

void React

export interface EditorTreeFrameProps {
  ariaLabel: string
  header?: ReactNode
  footer?: ReactNode
  children?: ReactNode
  className?: string
  contentRef?: RefObject<HTMLDivElement | null>
  style?: CSSProperties
}

/** Flexible chrome around a tree surface, with host-owned header and footer slots. */
export function EditorTreeFrame({
  ariaLabel,
  header,
  footer,
  children,
  className,
  contentRef,
  style
}: EditorTreeFrameProps) {
  return (
    <div
      className={[styles.pane, className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      role="group"
      style={style}
    >
      {header != null && (
        <div data-editor-tree-header="" className={styles.paneHeader}>
          {header}
        </div>
      )}
      <div ref={contentRef} data-editor-tree-content="" className={styles.paneContent}>
        {children}
      </div>
      {footer != null && (
        <div data-editor-tree-footer="" className={styles.paneFooter}>
          {footer}
        </div>
      )}
    </div>
  )
}

export interface EditorTreePaneProps extends Omit<EditorTreeFrameProps, 'children'> {
  tree: EditorTreeViewProps
}

/** The supported public composition root for virtualized editor trees. */
export function EditorTreePane({ tree, ...frame }: EditorTreePaneProps) {
  return (
    <EditorTreeFrame {...frame}>
      <EditorTreeView {...tree} />
    </EditorTreeFrame>
  )
}
