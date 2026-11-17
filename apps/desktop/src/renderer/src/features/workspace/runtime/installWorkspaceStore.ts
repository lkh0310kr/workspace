import { getWorkspaceState, onWorkspaceUpdated, setTabLayout } from './workspaceApi'
import { subscribeOptimisticWorkspaceTab } from '../state/optimisticWorkspaceTab'
import { syncInteractionCoordinatorWorkspaceTab } from './syncInteractionCoordinatorWorkspaceTab'
import { useWorkspaceStore } from '../state/workspaceStore'
import {
  configurePaneSystemLayoutPersistence,
  usePaneSystemStore
} from '../../pane-system/state/paneSystemStore'

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
  configurePaneSystemLayoutPersistence(setTabLayout)
  if (initPromise) return initPromise
  initPromise = (async () => {
    installWorkspaceStoreCoordinatorBridge()
    const ws = await getWorkspaceState()
    hydrateWorkspace(ws)
    syncInteractionCoordinatorWorkspaceTab('hydrate')
    return onWorkspaceUpdated((next) => {
      hydrateWorkspace(next)
      syncInteractionCoordinatorWorkspaceTab('workspace-updated')
    })
  })()
  return initPromise
}

function hydrateWorkspace(ws: Awaited<ReturnType<typeof getWorkspaceState>>): void {
  const layoutChanged = useWorkspaceStore.getState().hydrateFromWorkspace(ws)
  if (layoutChanged) usePaneSystemStore.getState().syncWorkspaceLayouts(ws.tabs)
}
