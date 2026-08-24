import { useState } from "react";
import { createPortal } from "react-dom";
import { openDirectoryDialog, setTabRootPath } from "../electron";

interface Props {
  onClose: () => void;
  tabId: number;
  tabTitle: string;
  rootPath: string;
}

export function SettingsDialog({ onClose, tabId, tabTitle, rootPath }: Props) {
  const [pathInput, setPathInput] = useState(rootPath);
  const [error, setError] = useState<string | null>(null);

  const savePath = (path: string) => {
    if (path === rootPath) return;
    setTabRootPath(tabId, path)
      .then(() => setError(null))
      .catch((err) => setError(String(err)));
  };

  const browse = async () => {
    try {
      const selected = await openDirectoryDialog(rootPath);
      if (selected) {
        setPathInput(selected);
        savePath(selected);
      }
    } catch (err) {
      // Without this, a failed invoke (e.g. main process still running an
      // older build that predates this IPC handler) was a silent
      // unhandled rejection — the button just looked like it did nothing.
      setError(String(err));
    }
  };

  return createPortal(
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings — {tabTitle}</span>
          <button type="button" className="settings-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="settings-section-title">Tab</div>
        <div className="settings-row settings-row-column">
          <span className="settings-row-label">
            Base path — root for this tab's terminals and file explorer
          </span>
          <div className="settings-path-row">
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") savePath(pathInput);
              }}
            />
            <button type="button" onClick={browse}>
              Browse…
            </button>
            <button type="button" onClick={() => savePath(pathInput)} disabled={pathInput === rootPath}>
              Save
            </button>
          </div>
          {error && <span className="settings-error">{error}</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
