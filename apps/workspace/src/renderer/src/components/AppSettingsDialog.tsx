import { useState } from "react";
import { Popover } from "./Popover";
import { ThemePreference } from "../theme";
import { getStoredAutoSave, setStoredAutoSave } from "../autosave";
import {
  USAGE_PROVIDER_IDS,
  USAGE_PROVIDER_LABELS,
  type UsageMeterSettings,
  type UsageProviderId,
} from "../../../shared/usage-meter-settings";

interface Props {
  anchorRect: DOMRect;
  onClose: () => void;
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  usageMeterSettings: UsageMeterSettings;
  onUsageMeterSettingsChange: (next: UsageMeterSettings) => void;
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function AppSettingsDialog({
  anchorRect,
  onClose,
  themePreference,
  onThemeChange,
  usageMeterSettings,
  onUsageMeterSettingsChange,
}: Props) {
  const [autoSave, setAutoSave] = useState(getStoredAutoSave);

  const changeAutoSave = (enabled: boolean) => {
    setStoredAutoSave(enabled);
    setAutoSave(enabled);
  };

  const toggleUsageProvider = (id: UsageProviderId) => {
    const set = new Set(usageMeterSettings.enabled);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onUsageMeterSettingsChange({
      enabled: USAGE_PROVIDER_IDS.filter((p) => set.has(p)),
    });
  };

  return (
    <Popover anchorRect={anchorRect} onClose={onClose} align="end" className="settings-dialog">
      <div className="settings-header">
        <span>Settings</span>
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
      <div className="settings-section-title">Status bar</div>
      <div className="settings-row settings-row-column">
        <span className="settings-row-label">AI agent usage meters — click the status bar for details</span>
        <div className="usage-settings-toggles">
          {USAGE_PROVIDER_IDS.map((id) => (
            <label key={id} className="usage-details-toggle">
              <input
                type="checkbox"
                checked={usageMeterSettings.enabled.includes(id)}
                onChange={() => toggleUsageProvider(id)}
              />
              {USAGE_PROVIDER_LABELS[id]}
            </label>
          ))}
        </div>
      </div>
      <div className="settings-section-title">Editing</div>
      <div className="settings-row settings-row-column">
        <span className="settings-row-label">
          Markdown save — auto-saves shortly after you stop typing, or only on Cmd+S
        </span>
        <div className="settings-theme-options">
          <button
            type="button"
            className={`settings-theme-option${!autoSave ? " active" : ""}`}
            onClick={() => changeAutoSave(false)}
          >
            Manual (Cmd+S)
          </button>
          <button
            type="button"
            className={`settings-theme-option${autoSave ? " active" : ""}`}
            onClick={() => changeAutoSave(true)}
          >
            Auto-save
          </button>
        </div>
      </div>
    </Popover>
  );
}
