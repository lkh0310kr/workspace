import styles from './PkmsDialog.module.css'

export type PkmsDialogRequest = {
  kind: 'confirm'
  message: string
  title?: string
  confirmLabel?: string
  detail?: string
  resolve: (value: boolean) => void
}

interface Props {
  request: PkmsDialogRequest | null
  onClose: () => void
}

export function PkmsDialog({ request, onClose }: Props): React.JSX.Element | null {
  if (!request) return null

  const cancel = () => {
    request.resolve(false)
    onClose()
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') cancel()
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm action"
      >
        <>
          <h2>{request.title ?? 'Confirm'}</h2>
          <p>{request.message}</p>
          {request.detail && <p>{request.detail}</p>}
          <div className={styles.actions}>
            <button className={styles.secondaryButton} onClick={cancel}>
              Cancel
            </button>
            <button
              className={styles.dangerButton}
              onClick={() => {
                request.resolve(true)
                onClose()
              }}
            >
              {request.confirmLabel ?? 'Delete'}
            </button>
          </div>
        </>
      </section>
    </div>
  )
}
