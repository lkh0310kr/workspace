import { Popover } from '@renderer/adapters/ui'
import { ThemePreference } from '../../theme'
import { UsageMeterSettingsSection } from '@renderer/features/agent-usage'
import type { UsageMeterSettings } from '../../../../shared/usage-meter-settings'

interface Props {
  anchorRect: DOMRect
  onClose: () => void
  themePreference: ThemePreference
  onThemeChange: (preference: ThemePreference) => void
  usageMeterSettings: UsageMeterSettings
  onUsageMeterSettingsChange: (next: UsageMeterSettings) => void
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
]

export function AppSettingsDialog({
  anchorRect,
  onClose,
  themePreference,
  onThemeChange,
  usageMeterSettings,
  onUsageMeterSettingsChange
}: Props) {
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
              className={`settings-theme-option${option.value === themePreference ? ' active' : ''}`}
              onClick={() => onThemeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <UsageMeterSettingsSection
        settings={usageMeterSettings}
        onChange={onUsageMeterSettingsChange}
      />
    </Popover>
  )
}
