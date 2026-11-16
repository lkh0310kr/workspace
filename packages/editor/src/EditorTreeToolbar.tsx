import React, { type ReactNode } from 'react'
import styles from './treeView.module.css'

void React

export interface EditorTreeToolbarProps {
  title: ReactNode
  status?: ReactNode
  actions?: ReactNode
  className?: string
  headingClassName?: string
  actionsClassName?: string
}

/** Shared toolbar frame for tree panes; hosts provide provider-specific status and actions. */
export function EditorTreeToolbar({
  title,
  status,
  actions,
  className,
  headingClassName,
  actionsClassName
}: EditorTreeToolbarProps) {
  return (
    <div
      data-editor-tree-toolbar=""
      className={[styles.toolbar, className].filter(Boolean).join(' ')}
    >
      <div className={[styles.toolbarHeading, headingClassName].filter(Boolean).join(' ')}>
        <span className={styles.toolbarTitle}>{title}</span>
        {status != null && (
          <span className={styles.toolbarStatus} data-editor-tree-status="">
            {status}
          </span>
        )}
      </div>
      {actions != null && (
        <div className={[styles.toolbarActions, actionsClassName].filter(Boolean).join(' ')}>
          {actions}
        </div>
      )}
    </div>
  )
}
