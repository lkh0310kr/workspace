import {
  DEFAULT_USAGE_METER_SETTINGS,
  normalizeUsageMeterSettings,
  type UsageMeterSettings,
} from "../shared/usage-meter-settings";
import { loadConfig, saveConfig } from "./persistence";

export function loadUsageMeterSettings(): UsageMeterSettings {
  const config = loadConfig();
  return normalizeUsageMeterSettings(config.usageMeters ?? DEFAULT_USAGE_METER_SETTINGS);
}

export function saveUsageMeterSettings(settings: UsageMeterSettings): void {
  const config = loadConfig();
  saveConfig({ ...config, usageMeters: normalizeUsageMeterSettings(settings) });
}
