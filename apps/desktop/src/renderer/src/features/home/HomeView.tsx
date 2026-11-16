import type { ReadSystemSummary } from '../../../../shared/systemSummary'
import { SystemInformationWidget } from './widgets/SystemInformationWidget'
import styles from './home.module.css'

type Props = {
  readSystemSummary: ReadSystemSummary
}

export function HomeView({ readSystemSummary }: Props): React.JSX.Element {
  return (
    <div className={`${styles.view} scroll-region`}>
      <div className={styles.inner}>
        <SystemInformationWidget readSystemSummary={readSystemSummary} />
      </div>
    </div>
  )
}
