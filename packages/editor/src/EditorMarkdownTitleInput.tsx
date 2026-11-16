import type { ChangeEvent, KeyboardEvent, RefObject } from 'react'
import styles from './markdownDocument.module.css'

interface Props {
  inputRef: RefObject<HTMLInputElement | null>
  value: string
  error: string | null
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

/** Shared inline title editor; hosts retain validation and provider rename policy. */
export function EditorMarkdownTitleInput({
  inputRef,
  value,
  error,
  onChange,
  onCommit,
  onCancel
}: Props) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      inputRef.current?.blur()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <div className={styles['md-title-edit']} data-editor-markdown-title-edit="">
      <input
        ref={inputRef}
        aria-label="Markdown document title"
        className={`${styles['editor-markdown-title']} ${styles['md-title-input']}${error ? ` ${styles.error}` : ''}`}
        data-editor-markdown-title=""
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
      />
      {error && (
        <div className={styles['md-title-error']} role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
