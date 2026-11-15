import React, { type ReactNode } from 'react'

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
    <div className={['editor-tree-toolbar', className].filter(Boolean).join(' ')}>
      <div className={['editor-tree-toolbar-heading', headingClassName].filter(Boolean).join(' ')}>
        <span className="editor-tree-toolbar-title">{title}</span>
        {status}
      </div>
      {actions != null && (
        <div
          className={['editor-tree-toolbar-actions', actionsClassName].filter(Boolean).join(' ')}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
