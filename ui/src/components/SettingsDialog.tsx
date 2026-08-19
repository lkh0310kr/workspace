import { createPortal } from "react-dom";
import { ThemePreference } from "../theme";

interface Props {
  onClose: () => void;
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function SettingsDialog({ onClose, themePreference, onThemeChange }: Props) {
  return createPortal(
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>,
    document.body,
  );
}
