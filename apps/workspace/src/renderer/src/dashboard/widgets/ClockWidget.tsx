import { useEffect, useState } from "react";
import { DashboardWidget } from "../DashboardWidget";

function formatClockParts(now: Date): { time: string; date: string; zone: string } {
  const time = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const date = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { time, date, zone };
}

export function ClockWidget(): React.JSX.Element {
  const [parts, setParts] = useState(() => formatClockParts(new Date()));

  useEffect(() => {
    const id = window.setInterval(() => setParts(formatClockParts(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <DashboardWidget className="dashboard-widget--brief" ariaLabel="현재 시각">
      <div className="dashboard-clock">
        <div className="dashboard-clock-time">{parts.time}</div>
        <div className="dashboard-clock-meta">
          <span>{parts.date}</span>
          <span className="dashboard-clock-zone">{parts.zone}</span>
        </div>
      </div>
    </DashboardWidget>
  );
}
