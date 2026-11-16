import type { PkmsSyncBridgeStatus } from '../platform/desktopApi'

export type PkmsSyncItemState = PkmsSyncBridgeStatus['itemStates'][string]

export function aggregateFolderSyncItemState(
  folderPath: string,
  itemStates: Record<string, PkmsSyncItemState>,
  ownState?: PkmsSyncItemState
): PkmsSyncItemState | undefined {
  const descendants = Object.entries(itemStates)
    .filter(([itemPath]) => itemPath.startsWith(`${folderPath}/`))
    .map(([, state]) => state)
  const states = ownState ? [ownState, ...descendants] : descendants

  if (states.includes('attention')) return 'attention'
  if (states.includes('syncing')) return 'syncing'
  if (states.includes('pending')) return 'pending'
  if (states.length > 0 && states.every((state) => state === 'excluded'))
    return 'excluded'
  if (states.length > 0 && states.every((state) => state === 'synced')) return 'synced'
  return undefined
}
