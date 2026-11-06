import { ServiceStatusWidget } from "./widgets/ServiceStatusWidget";

export function DashboardView(): React.JSX.Element {
  return (
    <div className="dashboard-view scroll-region dashboard-view--operations">
      <div className="dashboard-view-inner">
        <header className="operations-masthead">
          <div className="operations-brand"><span className="operations-brand-mark">◎</span><div><span className="home-overline">HOME / OPERATIONS</span><strong>Service observability</strong></div></div>
          <span className="operations-live"><i /> LIVE OVERVIEW</span>
        </header>
        <ServiceStatusWidget />
      </div>
    </div>
  );
}
