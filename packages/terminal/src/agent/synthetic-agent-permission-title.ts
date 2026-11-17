const SYNTHETIC_PERMISSION_TITLES = new Set(
  [
    'codex - action required',
    'claude - action required',
  ].map((t) => t.toLowerCase())
)

export function isSyntheticAgentPermissionTitle(title: string): boolean {
  return SYNTHETIC_PERMISSION_TITLES.has(title.trim().toLowerCase())
}
