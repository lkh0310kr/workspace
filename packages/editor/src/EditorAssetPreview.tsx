import React from 'react'
import styles from './assetPreview.module.css'

void React

export interface EditorAssetPreviewProps {
  fileName: string
  path: string
  size?: number
  contentType: string
  url: string | null
  loading?: boolean
  error?: string | null
  onDownload?: () => void
  downloadLabel?: string
}

function formatSize(size?: number): string {
  if (size === undefined || !Number.isFinite(size)) return 'Attachment'
  if (size < 1024) return `${size} B`
  return `${(size / 1024).toFixed(1)} KB`
}

/** Shared read-only preview frame for local attachments. */
export function EditorAssetPreview({
  fileName,
  path,
  size,
  contentType,
  url,
  loading = false,
  error,
  onDownload,
  downloadLabel = 'Download'
}: EditorAssetPreviewProps) {
  return (
    <section className={styles.preview} data-editor-asset-preview="">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 title={fileName}>{fileName}</h2>
          <p>{formatSize(size)}</p>
        </div>
        {url && onDownload && (
          <button
            type="button"
            className={styles.download}
            onClick={onDownload}
            aria-label={`${downloadLabel} ${fileName}`}
          >
            {downloadLabel}
          </button>
        )}
      </header>
      <div className={styles.content}>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : url ? (
          contentType.startsWith('image/') ? (
            <img className={styles.image} src={url} alt={path} />
          ) : (
            <iframe className={styles.frame} src={url} title={path} />
          )
        ) : loading ? (
          <span className={styles.loading} role="status">
            Opening attachment…
          </span>
        ) : null}
      </div>
    </section>
  )
}
