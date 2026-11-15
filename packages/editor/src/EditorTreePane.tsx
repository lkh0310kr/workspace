import type { CSSProperties, ReactNode, RefObject } from 'react'
import { EditorTreeView, type EditorTreeViewProps } from './EditorTreeView'

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
      className={['editor-tree-pane', className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      role="group"
      style={style}
    >
      {header != null && <div className="editor-tree-pane-header">{header}</div>}
      <div ref={contentRef} className="editor-tree-pane-content">
        {children}
      </div>
      {footer != null && <div className="editor-tree-pane-footer">{footer}</div>}
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
