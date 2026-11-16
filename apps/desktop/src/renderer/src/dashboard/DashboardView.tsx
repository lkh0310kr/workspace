import { SystemInformationWidget } from './widgets/SystemInformationWidget'

export function DashboardView(): React.JSX.Element {
  return (
    <div className="dashboard-view scroll-region dashboard-view--operations">
      <div className="dashboard-view-inner">
        <SystemInformationWidget />
      </div>
    </div>
  )
}
