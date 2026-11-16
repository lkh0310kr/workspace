import {
  parkBrowserPageViewport,
  resolveOrphanWebviewPolicy,
  resolveWebviewPolicy
} from '@workspace/browser'
import { browserFocusLog, snapshotBrowserFocusState } from './browserFocusDebugLog'
import { focusBrowserGuestWebview } from './browserGuestFocus'
import {
  getActiveBrowserWebview,
  setActiveBrowserWebview,
  setGuestWebContentsFocus
} from './activeBrowserWebview'
import {
  interactionCoordinator,
  type InteractionCoordinatorImpl
} from '../../../interaction/portals/InteractionCoordinator'
import { registerKeyboardSurfaceRelease } from '../../../interaction/focus/keyboardSurface'

const WEBVIEW_FOCUS_MAX_FRAMES = 12

type WebviewRegistration = {
  webview: Electron.WebviewTag
  workspaceTabId: number
  paneNodeId: string
  paneTabItemId: string
  paneVisible: boolean
  chipActive: boolean
}

/** Browser-owned lifecycle, visibility, and focus controller for native guests. */
export class BrowserInteractionController {
  private webviews = new Map<Electron.WebviewTag, WebviewRegistration>()
  private pendingFocusWebview: Electron.WebviewTag | null = null
  private focusScheduleEpoch = new WeakMap<Electron.WebviewTag, number>()
  private activeWorkspaceTabId: number | null
  private unsubscribeShell: () => void
  private unregisterMetric: () => void

  constructor(private readonly shell: InteractionCoordinatorImpl) {
    this.activeWorkspaceTabId = shell.getSnapshot().activeWorkspaceTabId
    this.unsubscribeShell = shell.subscribe(() => this.reconcileFromShell())
    this.unregisterMetric = shell.registerFeatureMetric(
      'browser.registeredWebviews',
      () => this.webviews.size
    )
    this.reconcileFromShell()
  }

  dispose(): void {
    this.unsubscribeShell()
    this.unregisterMetric()
  }

  releaseKeyboardFromBrowserGuests(reason: string): void {
    this.pendingFocusWebview = null
    for (const registration of this.webviews.values()) {
      const webview = registration.webview
      try {
        webview.blur()
        const webContentsId = webview.getWebContentsId()
        setGuestWebContentsFocus(webContentsId, false)
        void window.api.browser.blurGuest(webContentsId)
      } catch {
        /* guest may be mid-teardown */
      }
    }
    setActiveBrowserWebview(null)
    this.moveFocusFromEmbeds()
    browserFocusLog('BrowserInteractionController.releaseKeyboardFromBrowserGuests', reason, {
      registeredWebviewCount: this.webviews.size,
      ...snapshotBrowserFocusState(getActiveBrowserWebview())
    })
  }

  registerWebview(
    webview: Electron.WebviewTag,
    info: {
      workspaceTabId: number
      paneNodeId: string
      paneTabItemId: string
      initialPaneVisible?: boolean
      initialChipActive?: boolean
    }
  ): void {
    const existing = this.webviews.get(webview)
    if (existing) {
      existing.workspaceTabId = info.workspaceTabId
      existing.paneNodeId = info.paneNodeId
      existing.paneTabItemId = info.paneTabItemId
      if (info.initialPaneVisible !== undefined) existing.paneVisible = info.initialPaneVisible
      if (info.initialChipActive !== undefined) existing.chipActive = info.initialChipActive
      this.shell.reconcile(`register-webview-update:${info.paneTabItemId}`)
      return
    }
    const registration: WebviewRegistration = {
      webview,
      workspaceTabId: info.workspaceTabId,
      paneNodeId: info.paneNodeId,
      paneTabItemId: info.paneTabItemId,
      paneVisible: info.initialPaneVisible ?? false,
      chipActive: info.initialChipActive ?? true
    }
    this.webviews.set(webview, registration)
    if (registration.chipActive && registration.paneVisible) this.pendingFocusWebview = webview
    this.shell.reconcile(`register-webview:${info.paneTabItemId}`)
  }

  updateWebviewPaneNode(webview: Electron.WebviewTag, paneNodeId: string): void {
    const registration = this.webviews.get(webview)
    if (registration && registration.paneNodeId !== paneNodeId) {
      registration.paneNodeId = paneNodeId
    }
  }

  unregisterWebview(webview: Electron.WebviewTag): void {
    const registration = this.webviews.get(webview)
    if (!registration) return
    this.webviews.delete(webview)
    this.cancelWebviewFocusSchedule(webview)
    if (this.pendingFocusWebview === webview) this.pendingFocusWebview = null
    parkBrowserPageViewport(registration.paneTabItemId)
    this.shell.reconcile('unregister-webview')
  }

  /** Park the viewport on chrome unmount without dropping guest registration. */
  detachWebview(webview: Electron.WebviewTag): void {
    const registration = this.webviews.get(webview)
    if (!registration) return
    this.cancelWebviewFocusSchedule(webview)
    if (this.pendingFocusWebview === webview) this.pendingFocusWebview = null
    parkBrowserPageViewport(registration.paneTabItemId)
    this.shell.reconcile('detach-browser-webview')
  }

  setPaneChipState(
    workspaceTabId: number,
    paneTabItemId: string,
    patch: { paneVisible?: boolean; chipActive?: boolean }
  ): void {
    let changed = false
    let shouldFocus = false
    let becameHidden = false
    let targetPaneNodeId: string | null = null

    if (patch.chipActive === true) {
      for (const registration of this.webviews.values()) {
        if (
          registration.workspaceTabId === workspaceTabId &&
          registration.paneTabItemId === paneTabItemId
        ) {
          targetPaneNodeId = registration.paneNodeId
          break
        }
      }
      if (targetPaneNodeId) {
        for (const registration of this.webviews.values()) {
          if (
            registration.workspaceTabId === workspaceTabId &&
            registration.paneNodeId === targetPaneNodeId &&
            registration.paneTabItemId !== paneTabItemId &&
            registration.chipActive
          ) {
            registration.chipActive = false
            changed = true
          }
        }
      }
    }

    for (const registration of this.webviews.values()) {
      if (
        registration.workspaceTabId !== workspaceTabId ||
        registration.paneTabItemId !== paneTabItemId
      ) {
        continue
      }
      const nextPaneVisible = patch.paneVisible ?? registration.paneVisible
      const nextChipActive = patch.chipActive ?? registration.chipActive
      const paneBecameVisible = !registration.paneVisible && nextPaneVisible
      const chipBecameActive = !registration.chipActive && nextChipActive
      if (registration.paneVisible !== nextPaneVisible) {
        registration.paneVisible = nextPaneVisible
        changed = true
      }
      if (registration.chipActive !== nextChipActive) {
        registration.chipActive = nextChipActive
        changed = true
      }
      shouldFocus = nextPaneVisible && nextChipActive && (paneBecameVisible || chipBecameActive)
      becameHidden = !nextPaneVisible || !nextChipActive
      break
    }
    if (!changed) return
    if (shouldFocus) {
      const webview = this.findWebview(workspaceTabId, paneTabItemId)
      if (webview) this.pendingFocusWebview = webview
    }
    this.shell.reconcile(`browser-pane-chip:${paneTabItemId}`)
    if (becameHidden) this.blurWebviewIfFocused(workspaceTabId, paneTabItemId)
  }

  requestGuestFocus(workspaceTabId: number, paneTabItemId: string, reason = 'request'): void {
    const webview = this.findWebview(workspaceTabId, paneTabItemId)
    if (!webview) return
    this.pendingFocusWebview = webview
    this.shell.reconcile(`browser-focus-request:${reason}`)
  }

  isGuestInteractive(webview: Electron.WebviewTag): boolean {
    const registration = this.webviews.get(webview)
    if (!registration) return false
    const snapshot = this.shell.getSnapshot()
    return resolveWebviewPolicy({
      workspaceTabId: registration.workspaceTabId,
      paneVisible: registration.paneVisible,
      chipActive: registration.chipActive,
      activeWorkspaceTabId: snapshot.activeWorkspaceTabId,
      overlayBlocked: snapshot.overlayBlockCount > 0,
      portalsOpen: snapshot.portalIds.length > 0
    }).interactive
  }

  lookupWebviewRegistration(
    webview: Electron.WebviewTag
  ): Pick<WebviewRegistration, 'workspaceTabId' | 'paneNodeId' | 'paneTabItemId'> | null {
    const registration = this.webviews.get(webview)
    if (!registration) return null
    return {
      workspaceTabId: registration.workspaceTabId,
      paneNodeId: registration.paneNodeId,
      paneTabItemId: registration.paneTabItemId
    }
  }

  private reconcileFromShell(): void {
    const snapshot = this.shell.getSnapshot()
    const sameWorkspace = this.activeWorkspaceTabId === snapshot.activeWorkspaceTabId
    const hadGuestFocus = !sameWorkspace && this.hasWebviewOrGuestFocus()
    if (!sameWorkspace) {
      this.moveFocusFromEmbeds()
      this.activeWorkspaceTabId = snapshot.activeWorkspaceTabId
    }

    const blocked = snapshot.overlayBlockCount > 0
    const portalsOpen = snapshot.portalIds.length > 0
    browserFocusLog('BrowserInteractionController.reconcile', snapshot.lastReconcileReason, {
      blocked,
      portalsOpen,
      activeTab: snapshot.activeWorkspaceTabId,
      webviewCount: this.webviews.size
    })

    for (const registration of this.webviews.values()) {
      const policy = resolveWebviewPolicy({
        workspaceTabId: registration.workspaceTabId,
        paneVisible: registration.paneVisible,
        chipActive: registration.chipActive,
        activeWorkspaceTabId: snapshot.activeWorkspaceTabId,
        overlayBlocked: blocked,
        portalsOpen
      })
      this.applyRegistrationPolicy(registration, policy)
    }

    for (const element of document.querySelectorAll('webview')) {
      const webview = element as Electron.WebviewTag
      if (this.webviews.has(webview)) continue
      const host = webview.closest('[data-workspace-tab-id]')
      const tabIdAttr = host?.getAttribute('data-workspace-tab-id')
      const parsedTabId = tabIdAttr !== null && tabIdAttr !== '' ? Number(tabIdAttr) : null
      const hostWorkspaceTabId = Number.isFinite(parsedTabId) ? parsedTabId : null
      this.applyOrphanWebviewPolicy(
        webview,
        resolveOrphanWebviewPolicy(
          hostWorkspaceTabId,
          snapshot.activeWorkspaceTabId,
          blocked,
          portalsOpen
        )
      )
    }

    if (this.pendingFocusWebview) {
      const webview = this.pendingFocusWebview
      this.pendingFocusWebview = null
      this.scheduleWebviewFocus(webview)
    }
    if (hadGuestFocus) this.refocusPrimaryBrowserGuest()
  }

  private cancelWebviewFocusSchedule(webview: Electron.WebviewTag): void {
    this.focusScheduleEpoch.set(webview, (this.focusScheduleEpoch.get(webview) ?? 0) + 1)
  }

  private scheduleWebviewFocus(webview: Electron.WebviewTag): void {
    const epoch = (this.focusScheduleEpoch.get(webview) ?? 0) + 1
    this.focusScheduleEpoch.set(webview, epoch)
    let attempts = 0
    const runFocus = (): void => {
      if (this.focusScheduleEpoch.get(webview) !== epoch || !this.webviews.has(webview)) return
      if (attempts >= WEBVIEW_FOCUS_MAX_FRAMES) return
      attempts += 1
      if (!this.isGuestInteractive(webview)) {
        browserFocusLog(
          'BrowserInteractionController.scheduleWebviewFocus',
          'guest not interactive yet',
          { attempts, ...snapshotBrowserFocusState(webview) }
        )
        window.requestAnimationFrame(runFocus)
        return
      }
      try {
        focusBrowserGuestWebview(webview, `schedule-focus-${attempts}`)
      } catch {
        /* webview may be mid-teardown */
      }
      browserFocusLog('BrowserInteractionController.scheduleWebviewFocus', 'focus attempt', {
        attempts,
        ...snapshotBrowserFocusState(webview)
      })
    }
    window.requestAnimationFrame(runFocus)
  }

  private applyRegistrationPolicy(
    registration: WebviewRegistration,
    policy: { visible: boolean; interactive: boolean }
  ): void {
    const webview = registration.webview
    webview.style.display = policy.visible ? 'flex' : 'none'
    webview.style.flex = '1'
    webview.style.pointerEvents = policy.interactive ? 'auto' : 'none'
    webview.inert = !policy.interactive
  }

  private applyOrphanWebviewPolicy(
    webview: Electron.WebviewTag,
    policy: { visible: boolean; interactive: boolean }
  ): void {
    webview.style.display = policy.visible ? 'flex' : 'none'
    webview.style.pointerEvents = policy.interactive ? 'auto' : 'none'
    webview.inert = !policy.interactive
  }

  private findWebview(workspaceTabId: number, paneTabItemId: string): Electron.WebviewTag | null {
    for (const registration of this.webviews.values()) {
      if (
        registration.workspaceTabId === workspaceTabId &&
        registration.paneTabItemId === paneTabItemId
      ) {
        return registration.webview
      }
    }
    return null
  }

  private blurWebviewIfFocused(workspaceTabId: number, paneTabItemId: string): void {
    const webview = this.findWebview(workspaceTabId, paneTabItemId)
    if (!webview) return
    const active = document.activeElement
    if (active === webview || active?.closest?.('webview') === webview) this.moveFocusFromEmbeds()
  }

  private moveFocusFromEmbeds(): void {
    const active = document.activeElement
    if (!active || (active.tagName !== 'WEBVIEW' && !active.closest('webview'))) return
    const titlebar = document.querySelector('.titlebar')
    if (titlebar instanceof HTMLElement) titlebar.focus({ preventScroll: true })
  }

  private hasWebviewOrGuestFocus(): boolean {
    const active = document.activeElement
    return (
      active?.tagName === 'WEBVIEW' ||
      Boolean(active?.closest?.('webview')) ||
      getActiveBrowserWebview() !== null
    )
  }

  private refocusPrimaryBrowserGuest(): void {
    const current = getActiveBrowserWebview()
    if (current && this.isGuestInteractive(current)) {
      this.scheduleWebviewFocus(current)
      return
    }
    for (const registration of this.webviews.values()) {
      if (registration.workspaceTabId !== this.activeWorkspaceTabId) continue
      if (!registration.paneVisible || !registration.chipActive) continue
      if (!this.isGuestInteractive(registration.webview)) continue
      this.scheduleWebviewFocus(registration.webview)
      return
    }
  }
}

export const browserInteractionController = new BrowserInteractionController(interactionCoordinator)

registerKeyboardSurfaceRelease('browser', ['terminal'], (reason) =>
  browserInteractionController.releaseKeyboardFromBrowserGuests(reason)
)
