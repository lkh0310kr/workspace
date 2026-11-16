import {
  USAGE_PROVIDER_IDS,
  USAGE_PROVIDER_LABELS,
  type UsageMeterSettings,
  type UsageProviderId
} from '../../../../../shared/usage-meter-settings'

interface Props {
  settings: UsageMeterSettings
  onChange: (next: UsageMeterSettings) => void
}

export function UsageMeterSettingsSection({ settings, onChange }: Props) {
  const toggleProvider = (id: UsageProviderId) => {
    const enabled = new Set(settings.enabled)
    if (enabled.has(id)) enabled.delete(id)
    else enabled.add(id)
    onChange({ enabled: USAGE_PROVIDER_IDS.filter((provider) => enabled.has(provider)) })
  }

  return (
    <>
      <div className="settings-section-title">Status bar</div>
      <div className="settings-row settings-row-column">
        <span className="settings-row-label">
          AI agent usage meters — click the status bar for details
        </span>
        <div className="usage-settings-toggles">
          {USAGE_PROVIDER_IDS.map((id) => (
            <label key={id} className="usage-details-toggle">
              <input
                type="checkbox"
                checked={settings.enabled.includes(id)}
                onChange={() => toggleProvider(id)}
              />
              {USAGE_PROVIDER_LABELS[id]}
            </label>
          ))}
        </div>
      </div>
    </>
  )
}
