/** App-wide overlay, portal, and active workspace coordination. */

export type OverlaySource = string

type PortalRegistration = {
  dismiss: () => void
}

type Listener = () => void

export type InteractionSnapshot = {
  overlayBlockCount: number
  overlaySources: OverlaySource[]
  activeWorkspaceTabId: number | null
  portalIds: string[]
  featureMetrics: Record<string, number>
  lastReconcileReason: string
  lastReconcileAt: number
}

export class InteractionCoordinatorImpl {
  private overlayStack: OverlaySource[] = []
  private activeWorkspaceTabId: number | null = null
  private portals = new Map<string, PortalRegistration>()
  private listeners = new Set<Listener>()
  private featureMetrics = new Map<string, () => number>()
  private lastReconcileReason = 'init'
  private lastReconcileAt = 0

  pushOverlayBlock(source: OverlaySource): void {
    this.overlayStack.push(source)
    this.reconcile(`overlay-push:${source}`)
  }

  popOverlayBlock(source: OverlaySource): void {
    const idx = this.overlayStack.lastIndexOf(source)
    if (idx >= 0) this.overlayStack.splice(idx, 1)
    else if (this.overlayStack.length > 0) this.overlayStack.pop()
    this.reconcile(`overlay-pop:${source}`)
  }

  clearOverlayBlocks(reason = 'overlay-clear'): void {
    if (this.overlayStack.length === 0) return
    this.overlayStack = []
    this.reconcile(reason)
  }

  isOverlayBlocked(): boolean {
    return this.overlayStack.length > 0
  }

  setActiveWorkspaceTab(tabId: number, options?: { force?: boolean }): void {
    const same = this.activeWorkspaceTabId === tabId
    if (same && !options?.force) return
    this.activeWorkspaceTabId = tabId
    this.reconcile(same ? `active-workspace-tab-force:${tabId}` : `active-workspace-tab:${tabId}`)
  }

  registerPortal(id: string, dismiss: () => void): () => void {
    this.portals.set(id, { dismiss })
    this.reconcile(`portal-open:${id}`)
    return () => {
      this.portals.delete(id)
      this.reconcile(`portal-close:${id}`)
    }
  }

  dismissAllPortals(): void {
    document.querySelectorAll('.popover-catcher').forEach((element) => element.remove())
    for (const portal of this.portals.values()) portal.dismiss()
    this.notifyListeners()
  }

  registerFeatureMetric(key: string, readValue: () => number): () => void {
    this.featureMetrics.set(key, readValue)
    return () => {
      if (this.featureMetrics.get(key) === readValue) this.featureMetrics.delete(key)
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): InteractionSnapshot {
    const featureMetrics: Record<string, number> = {}
    for (const [key, readValue] of this.featureMetrics) featureMetrics[key] = readValue()
    return {
      overlayBlockCount: this.overlayStack.length,
      overlaySources: [...this.overlayStack],
      activeWorkspaceTabId: this.activeWorkspaceTabId,
      portalIds: [...this.portals.keys()],
      featureMetrics,
      lastReconcileReason: this.lastReconcileReason,
      lastReconcileAt: this.lastReconcileAt
    }
  }

  /** Publish an app-shell state change; feature controllers subscribe here. */
  reconcile(reason = 'manual'): void {
    this.lastReconcileReason = reason
    this.lastReconcileAt = Date.now()
    this.notifyListeners()
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) listener()
  }
}

export const interactionCoordinator = new InteractionCoordinatorImpl()

if (typeof window !== 'undefined') {
  window.addEventListener(
    'mouseup',
    () => {
      if (!interactionCoordinator.isOverlayBlocked()) return
      if (interactionCoordinator.getSnapshot().portalIds.length > 0) return
      interactionCoordinator.clearOverlayBlocks('overlay-mouseup-safety')
    },
    true
  )

  // Feature controllers reconcile native surfaces when the shell returns to focus.
  window.addEventListener('focus', () => interactionCoordinator.reconcile('window-focus'))
}
