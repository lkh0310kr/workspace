export const USAGE_PROVIDER_IDS = ['claude', 'codex'] as const
export type UsageProviderId = (typeof USAGE_PROVIDER_IDS)[number]

export type UsageMeterSettings = {
  enabled: UsageProviderId[]
}

export const DEFAULT_USAGE_METER_SETTINGS: UsageMeterSettings = {
  enabled: ['claude']
}

export const USAGE_PROVIDER_LABELS: Record<UsageProviderId, string> = {
  claude: 'Claude Code',
  codex: 'Codex'
}

export function normalizeUsageMeterSettings(raw: unknown): UsageMeterSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_USAGE_METER_SETTINGS }
  }
  const enabled = (raw as UsageMeterSettings).enabled
  if (!Array.isArray(enabled)) {
    return { ...DEFAULT_USAGE_METER_SETTINGS }
  }
  const set = new Set<UsageProviderId>()
  for (const id of enabled) {
    if (USAGE_PROVIDER_IDS.includes(id as UsageProviderId)) {
      set.add(id as UsageProviderId)
    }
  }
  return { enabled: USAGE_PROVIDER_IDS.filter((id) => set.has(id)) }
}
