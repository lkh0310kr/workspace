import { useEffect, useState } from "react";
import { getJapaneseLogs, type JapaneseDbStatus } from "../../electron";

interface Props {
  status: JapaneseDbStatus | null;
}

export function JapaneseDiagnostics({ status }: Props) {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    getJapaneseLogs(60)
      .then((entries) => setLogs(Array.isArray(entries) ? entries : []))
      .catch(() => setLogs([]));
  }, [status?.ready, status?.loadedPath, status?.entryCount]);

  if (!status) return null;

  return (
    <section className="japanese-diagnostics">
      <h3 className="japanese-section-title">Diagnostics</h3>
      {status.loadMessage ? <p className="japanese-diagnostics-alert">{status.loadMessage}</p> : null}
      <dl className="japanese-diagnostics-meta">
        <div>
          <dt>Primary path</dt>
          <dd>{status.path ?? "—"}</dd>
        </div>
        <div>
          <dt>Loaded path</dt>
          <dd>{status.loadedPath ?? "—"}</dd>
        </div>
        <div>
          <dt>Log file</dt>
          <dd>{status.logPath}</dd>
        </div>
      </dl>
      <table className="japanese-diagnostics-table">
        <thead>
          <tr>
            <th>Path</th>
            <th>Exists</th>
            <th>Words</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(status.probes ?? []).map((probe) => (
            <tr key={probe.path} className={probe.selected ? "is-selected" : undefined}>
              <td className="japanese-diagnostics-path">{probe.path}</td>
              <td>{probe.exists ? "yes" : "no"}</td>
              <td>{probe.lexemeCount}</td>
              <td>
                {probe.isPrimary ? "primary" : null}
                {probe.selected ? " loaded" : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className="japanese-diagnostics-log-title">Recent log</h4>
      <pre className="japanese-diagnostics-log">
        {logs.length === 0
          ? "(no log entries yet)"
          : logs
              .map((entry) => {
                const ts = typeof entry.ts === "string" ? entry.ts : "";
                const event = typeof entry.event === "string" ? entry.event : "event";
                const rest = { ...entry };
                delete rest.ts;
                delete rest.event;
                return `${ts} ${event} ${JSON.stringify(rest)}`;
              })
              .join("\n")}
      </pre>
    </section>
  );
}
