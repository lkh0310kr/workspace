import { ServiceStatusWidget } from "./widgets/ServiceStatusWidget";

export function DashboardView(): React.JSX.Element {
  return (
    <div className="dashboard-view scroll-region dashboard-view--operations">
      <div className="dashboard-view-inner">
        <ServiceStatusWidget />
      </div>
    </div>
  );
}
