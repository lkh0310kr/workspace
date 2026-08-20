import { useState } from "react";
import { createPortal } from "react-dom";
import { ThemePreference } from "../theme";
import { setTabRootPath } from "../tauri";

interface Props {
  onClose: () => void;
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  tabId: number;
  tabTitle: string;
  rootPath: string;
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function SettingsDialog({
  onClose,
  themePreference,
  onThemeChange,
  tabId,
  tabTitle,
  rootPath,
}: Props) {
  const [pathInput, setPathInput] = useState(rootPath);
  const [error, setError] = useState<string | null>(null);

  const savePath = () => {
    if (pathInput === rootPath) return;
    setTabRootPath(tabId, pathInput)
      .then(() => setError(null))
      .catch((err) => setError(String(err)));
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
        <div className="settings-section-title">Appearance</div>
        <div className="settings-row">
          <span className="settings-row-label">Theme</span>
          <div className="settings-theme-options">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`settings-theme-option${option.value === themePreference ? " active" : ""}`}
                onClick={() => onThemeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
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
                if (e.key === "Enter") savePath();
              }}
            />
            <button type="button" onClick={savePath} disabled={pathInput === rootPath}>
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
