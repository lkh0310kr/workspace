import { getWorkspaceState, onWorkspaceUpdated } from './workspaceApi'
import { subscribeOptimisticWorkspaceTab } from '../state/optimisticWorkspaceTab'
import { syncInteractionCoordinatorWorkspaceTab } from './syncInteractionCoordinatorWorkspaceTab'
import { useWorkspaceStore } from '../state/workspaceStore'

let coordinatorBridgeInstalled = false

export function installWorkspaceStoreCoordinatorBridge(): void {
  if (coordinatorBridgeInstalled) return
  coordinatorBridgeInstalled = true

  useWorkspaceStore.subscribe(
    (state) => state.activeTabId,
    (activeTabId, prevActiveTabId) => {
      if (activeTabId === prevActiveTabId) return
      syncInteractionCoordinatorWorkspaceTab('store-active-tab')
    }
  )

  subscribeOptimisticWorkspaceTab(() => {
    syncInteractionCoordinatorWorkspaceTab('optimistic-tab')
  })
}

let initPromise: Promise<() => void> | null = null

export async function initWorkspaceStore(): Promise<() => void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    installWorkspaceStoreCoordinatorBridge()
    const ws = await getWorkspaceState()
    useWorkspaceStore.getState().hydrateFromWorkspace(ws)
    syncInteractionCoordinatorWorkspaceTab('hydrate')
    return onWorkspaceUpdated((next) => {
      useWorkspaceStore.getState().hydrateFromWorkspace(next)
      syncInteractionCoordinatorWorkspaceTab('workspace-updated')
    })
  })()
  return initPromise
}
