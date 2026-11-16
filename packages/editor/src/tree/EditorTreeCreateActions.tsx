import type { ReactNode } from 'react'
import styles from './treeView.module.css'

export interface EditorTreeCreateActionsProps {
  canCreateFile: boolean
  canCreateDirectory: boolean
  disabled?: boolean
  onCreateFile: () => void
  onCreateDirectory: (button: HTMLButtonElement) => void
}

/** Shared file and folder creation controls for provider backed trees. */
export function EditorTreeCreateActions({
  canCreateFile,
  canCreateDirectory,
  disabled = false,
  onCreateFile,
  onCreateDirectory
}: EditorTreeCreateActionsProps) {
  if (!canCreateFile && !canCreateDirectory) return null

  const fileIcon: ReactNode = (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 1.75h6l4 4v8.5H3zM9 1.75v4h4M8 8v5M5.5 10.5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  )
  const folderIcon: ReactNode = (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.75 4.5h5l1.25 1.25h6.25v7.5H1.75zM10.75 8v4M8.75 10h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )

  return (
    <div className={styles.createActions} data-editor-tree-create-actions="">
      {canCreateFile && (
        <button
          type="button"
          className={styles.createAction}
          data-editor-tree-create-action=""
          aria-label="New Markdown file"
          title="New Markdown file"
          disabled={disabled}
          onClick={onCreateFile}
        >
          {fileIcon}
        </button>
      )}
      {canCreateDirectory && (
        <button
          type="button"
          className={styles.createAction}
          data-editor-tree-create-action=""
          aria-label="New folder"
          title="New folder"
          disabled={disabled}
          onClick={(event) => onCreateDirectory(event.currentTarget)}
        >
          {folderIcon}
        </button>
      )}
    </div>
  )
}
