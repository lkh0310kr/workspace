import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import { EditorMarkdownProperties } from './EditorMarkdownProperties'
import { editorViewScrollElement } from './editorViewScrollContext'
import styles from './markdownDocument.module.css'

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
  const scrollRef = useRef<HTMLDivElement>(null)

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
        '.cm-editor, [data-editor-title-block], [data-editor-markdown-title], [data-editor-markdown-title-edit]'
      )
    )
      return
    onBackgroundClick?.(event)
  }

  return (
    <div
      className={[styles['editor-markdown-document'], wide && styles['is-wide'], className]
        .filter(Boolean)
        .join(' ')}
      data-editor-markdown-document=""
    >
      <div className={styles['editor-floating-actions']}>
        <button
          type="button"
          className={`${styles['editor-action-button']} ${styles['editor-width-toggle']}`}
          data-editor-action-button=""
          aria-label={wide ? 'Use readable document width' : 'Use wide document width'}
          aria-pressed={wide}
          title={wide ? 'Readable width' : 'Wide width'}
          onClick={() => setWide((value) => !value)}
        >
          <span aria-hidden="true">↔</span>
        </button>
        {actions}
      </div>
      <editorViewScrollElement.Provider value={scrollRef}>
        <div
          ref={scrollRef}
          className={styles['editor-markdown-scroll']}
          data-editor-markdown-scroll=""
          onClick={handleBackgroundClick}
        >
          {title}
          <EditorMarkdownProperties view={propertiesView} revision={propertiesRevision} />
          <div className={styles['editor-markdown-content']}>{children}</div>
        </div>
      </editorViewScrollElement.Provider>
    </div>
  )
}
