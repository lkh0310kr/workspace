import { useState } from "react";
import { ClockWidget } from "./widgets/ClockWidget";
import { EconomyWidget } from "./widgets/EconomyWidget";
import { NewspaperWidget, type NewspaperHeadline } from "./widgets/NewspaperWidget";
import { NotificationCenterWidget } from "./widgets/NotificationCenterWidget";
import { WeatherWidget } from "./widgets/WeatherWidget";

export function DashboardView(): React.JSX.Element {
  const [feedHeadlines, setFeedHeadlines] = useState<NewspaperHeadline[]>([]);

  return (
    <div className="dashboard-view scroll-region">
      <div className="dashboard-view-inner">
        <div className="dashboard-brief-row">
          <ClockWidget />
          <WeatherWidget />
        </div>

        <div className="dashboard-grid">
          <EconomyWidget />
          <NewspaperWidget onHeadlinesChange={setFeedHeadlines} />
          <NotificationCenterWidget feedHeadlines={feedHeadlines} />
        </div>
      </div>
    </div>
  );
}
