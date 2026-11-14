import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import { EditorMarkdownProperties } from './EditorMarkdownProperties'
import './markdownDocument.css'

const MARKDOWN_WIDTH_MODE_KEY = 'workspace.markdownWidthMode'

function readWideMode(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(MARKDOWN_WIDTH_MODE_KEY) === 'wide'
    )
  } catch {
    return false
  }
}

export interface EditorMarkdownDocumentProps {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  onBackgroundClick?: (event: MouseEvent<HTMLDivElement>) => void
  className?: string
  propertiesView?: EditorView | null
  propertiesRevision?: number
}

/** Workspace-baseline Markdown document frame shared across product shells. */
export function EditorMarkdownDocument({
  title,
  actions,
  children,
  onBackgroundClick,
  className,
  propertiesView = null,
  propertiesRevision = 0
}: EditorMarkdownDocumentProps) {
  const [wide, setWide] = useState(readWideMode)

  useEffect(() => {
    try {
      localStorage.setItem(MARKDOWN_WIDTH_MODE_KEY, wide ? 'wide' : 'readable')
    } catch {
      // Keep the current session preference if storage is unavailable.
    }
  }, [wide])

  const handleBackgroundClick = (event: MouseEvent<HTMLDivElement>) => {
    if (
      (event.target as HTMLElement).closest(
        '.cm-editor, .editor-title-block, .editor-markdown-title, .md-title-edit'
      )
    )
      return
    onBackgroundClick?.(event)
  }

  return (
    <div
      className={['editor-markdown-document', wide && 'is-wide', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="editor-floating-actions">
        <button
          type="button"
          className="editor-action-button editor-width-toggle"
          aria-label={wide ? 'Use readable document width' : 'Use wide document width'}
          aria-pressed={wide}
          title={wide ? 'Readable width' : 'Wide width'}
          onClick={() => setWide((value) => !value)}
        >
          <span aria-hidden="true">↔</span>
        </button>
        {actions}
      </div>
      <div className="editor-markdown-scroll" onClick={handleBackgroundClick}>
        {title}
        <EditorMarkdownProperties view={propertiesView} revision={propertiesRevision} />
        <div className="editor-markdown-content">{children}</div>
      </div>
    </div>
  )
}
