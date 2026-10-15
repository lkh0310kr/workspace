const SYNTHETIC_PERMISSION_TITLES = new Set(
  [
    'codex - action required',
    'cursor - action required',
    'opencode - action required',
    'claude - action required',
    'gemini - action required',
  ].map((t) => t.toLowerCase()),
)

export function isSyntheticAgentPermissionTitle(title: string): boolean {
  return SYNTHETIC_PERMISSION_TITLES.has(title.trim().toLowerCase())
}
