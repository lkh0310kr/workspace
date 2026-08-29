import { useState } from "react";
import { Popover } from "./Popover";
import { openDirectoryDialog, setTabRootPath } from "../electron";

interface Props {
  anchorRect: DOMRect;
  onClose: () => void;
  tabId: number;
  tabTitle: string;
  rootPath: string;
}

export function SettingsDialog({ anchorRect, onClose, tabId, tabTitle, rootPath }: Props) {
  const [pathInput, setPathInput] = useState(rootPath);
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const savePath = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) {
      setError("path cannot be empty");
      return;
    }
    if (trimmed === rootPath) return;

    setSaving(true);
    setError(null);
    try {
      const ws = await setTabRootPath(tabId, trimmed);
      const saved = ws.tabs.find((t) => t.id === tabId)?.root_path ?? trimmed;
      setPathInput(saved);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const browse = async () => {
    setBrowsing(true);
    setError(null);
    try {
      const selected = await openDirectoryDialog(pathInput.trim() || rootPath);
      if (!selected) return;
      setPathInput(selected);
      await savePath(selected);
    } catch (err) {
      setError(String(err));
    } finally {
      setBrowsing(false);
    }
  };

  const busy = browsing || saving;
  const canSave = pathInput.trim() !== rootPath && !busy;

  return (
    <Popover anchorRect={anchorRect} onClose={onClose} className="settings-dialog">
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
            disabled={busy}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) void savePath(pathInput);
            }}
          />
          <button type="button" onClick={() => void browse()} disabled={busy}>
            {browsing ? "Choosing…" : "Browse…"}
          </button>
          <button type="button" onClick={() => void savePath(pathInput)} disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {error && (
          <span className="settings-error" title={`Log: ~/.config/workspace-app-dev/folder-picker.log`}>
            {error}
          </span>
        )}
      </div>
    </Popover>
  );
}
