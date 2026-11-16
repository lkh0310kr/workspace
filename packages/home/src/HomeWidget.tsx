import type { JSX, ReactNode } from 'react'
import styles from './home.module.css'

type Props = {
  children?: ReactNode
  onRefresh?: () => void
  /** Screen-reader label — no visible section title. */
  ariaLabel?: string
}

export function HomeWidget({ children, onRefresh, ariaLabel }: Props): JSX.Element {
  return (
    <section
      className={`${styles.widget} ${styles.operationsWidget} ${styles.systemWidget}`}
      aria-label={ariaLabel}
    >
      {onRefresh ? (
        <button type="button" className={styles.refresh} onClick={onRefresh} aria-label="새로고침">
          ↻
        </button>
      ) : null}
      <div className={styles.widgetBody}>{children}</div>
    </section>
  )
}
