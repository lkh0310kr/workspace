import { ServiceStatusWidget } from "./widgets/ServiceStatusWidget";
import { SystemInformationWidget } from "./widgets/SystemInformationWidget";

export function DashboardView(): React.JSX.Element {
  return (
    <div className="dashboard-view scroll-region dashboard-view--operations">
      <div className="dashboard-view-inner">
        <SystemInformationWidget />
        <ServiceStatusWidget />
      </div>
    </div>
  );
}
