import type { PkmsSyncBridgeStatus } from '../platform/desktopApi'

export type PkmsSyncItemState = PkmsSyncBridgeStatus['itemStates'][string]

export function aggregateFolderSyncItemState(
  folderPath: string,
  itemStates: Record<string, PkmsSyncItemState>
): PkmsSyncItemState | undefined {
  const descendants = Object.entries(itemStates)
    .filter(([itemPath]) => itemPath.startsWith(`${folderPath}/`))
    .map(([, state]) => state)

  if (descendants.includes('attention')) return 'attention'
  if (descendants.includes('syncing')) return 'syncing'
  if (descendants.includes('pending')) return 'pending'
  if (descendants.length > 0 && descendants.every((state) => state === 'excluded'))
    return 'excluded'
  if (descendants.length > 0 && descendants.every((state) => state === 'synced')) return 'synced'
  return undefined
}
