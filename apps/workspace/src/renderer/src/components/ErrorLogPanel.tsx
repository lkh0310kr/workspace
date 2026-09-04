import { useEffect, useState } from "react";
import { clearErrors, dismissError, getErrorLog, subscribeErrorLog, type LoggedError } from "../errorLog";

// Small badge in the corner that appears only once something's actually
// gone wrong (uncaught error, unhandled promise rejection, or a pane's
// own PaneErrorBoundary catching a render crash) — click it to see the
// real message/stack instead of digging through devtools every time.
export function ErrorLogPanel() {
  const [entries, setEntries] = useState<LoggedError[]>(getErrorLog);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => subscribeErrorLog(setEntries), []);

  if (entries.length === 0) return null;

  return (
    <div className="error-log-panel">
      {expanded && (
        <div className="error-log-list">
          {entries
            .slice()
            .reverse()
            .map((entry) => (
              <div key={entry.id} className="error-log-entry">
                <div className="error-log-entry-header">
                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <button type="button" onClick={() => dismissError(entry.id)}>
                    ×
                  </button>
                </div>
                <div className="error-log-entry-message">{entry.message}</div>
                {entry.stack && <pre className="error-log-entry-stack">{entry.stack}</pre>}
              </div>
            ))}
          <button type="button" className="error-log-clear" onClick={clearErrors}>
            Clear all
          </button>
        </div>
      )}
      <button type="button" className="error-log-badge" onClick={() => setExpanded((v) => !v)}>
        ⚠ {entries.length}
      </button>
    </div>
  );
}
