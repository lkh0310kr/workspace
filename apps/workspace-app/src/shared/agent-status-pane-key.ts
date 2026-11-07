export type AgentStatusPaneIdentity = { workspaceTabId: number; paneTabId: string }

export function buildAgentStatusPaneKey(workspaceTabId: number, paneTabId: string): string {
  return `${workspaceTabId}:${paneTabId}`
}

export function parseAgentStatusPaneIdentity(paneKey: string | undefined): AgentStatusPaneIdentity | null {
  if (!paneKey) return null
  const colon = paneKey.indexOf(':')
  if (colon <= 0) return null
  const tabPart = paneKey.slice(0, colon)
  const paneTabId = paneKey.slice(colon + 1)
  const workspaceTabId = Number(tabPart)
  if (!Number.isFinite(workspaceTabId) || !paneTabId) return null
  return { workspaceTabId, paneTabId }
}
