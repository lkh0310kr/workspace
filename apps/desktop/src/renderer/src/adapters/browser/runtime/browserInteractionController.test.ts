/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ensureBrowserPageViewport,
  registerBrowserOverlaySlotViewport,
  resetBrowserPageViewportsForTests
} from '@workspace/browser'
import { BrowserInteractionController } from './browserInteractionController'
import { InteractionCoordinatorImpl } from '../../../interaction/portals/InteractionCoordinator'

function mockWebview(): Electron.WebviewTag {
  const el = document.createElement('webview') as Electron.WebviewTag
  el.focus = vi.fn()
  return el
}

function webviewStyles(wv: Electron.WebviewTag) {
  return {
    display: wv.style.display,
    pointerEvents: wv.style.pointerEvents,
    inert: wv.inert
  }
}

describe('InteractionCoordinator reconcile', () => {
  let coordinator: InteractionCoordinatorImpl
  let browserController: BrowserInteractionController | null = null

  afterEach(() => {
    browserController?.dispose()
    browserController = null
    document.body.innerHTML = ''
    resetBrowserPageViewportsForTests()
  })

  function freshCoordinator() {
    coordinator = new InteractionCoordinatorImpl()
    browserController = new BrowserInteractionController(coordinator)
    return coordinator
  }

  function registerBrowser(
    opts: {
      workspaceTabId?: number
      paneTabItemId?: string
      paneVisible?: boolean
      chipActive?: boolean
    } = {}
  ) {
    const paneTabItemId = opts.paneTabItemId ?? 'browser-1'
    const paneNodeId = 'pane-1'
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    registerBrowserOverlaySlotViewport(paneNodeId, slot)
    const viewport = ensureBrowserPageViewport(paneTabItemId, paneNodeId)
    if (!viewport) throw new Error('expected browser viewport')
    const webview = mockWebview()
    viewport.container.appendChild(webview)
    browserController!.registerWebview(webview, {
      workspaceTabId: opts.workspaceTabId ?? 1,
      paneNodeId: 'pane-1',
      paneTabItemId,
      initialPaneVisible: opts.paneVisible ?? true,
      initialChipActive: opts.chipActive ?? true
    })
    return webview
  }

  it('keeps webview flex and interactive when workspace tab, pane, and chip are active', () => {
    const c = freshCoordinator()
    const wv = registerBrowser()
    c.setActiveWorkspaceTab(1)

    expect(webviewStyles(wv)).toEqual({
      display: 'flex',
      pointerEvents: 'auto',
      inert: false
    })
  })

  it('locks webview input when workspace tab is inactive', () => {
    const c = freshCoordinator()
    const wv = registerBrowser()
    c.setActiveWorkspaceTab(2)

    expect(webviewStyles(wv)).toEqual({
      display: 'none',
      pointerEvents: 'none',
      inert: true
    })
  })

  it('locks webview input when pane is not visible', () => {
    const c = freshCoordinator()
    const wv = registerBrowser({ paneVisible: false })
    c.setActiveWorkspaceTab(1)

    expect(webviewStyles(wv)).toEqual({
      display: 'none',
      pointerEvents: 'none',
      inert: true
    })
  })

  it('locks webview input when chip is inactive', () => {
    const c = freshCoordinator()
    const wv = registerBrowser({ chipActive: false })
    c.setActiveWorkspaceTab(1)

    expect(webviewStyles(wv)).toEqual({
      display: 'none',
      pointerEvents: 'none',
      inert: true
    })
  })

  it('locks webview input while overlay is blocked', () => {
    const c = freshCoordinator()
    const wv = registerBrowser()
    c.setActiveWorkspaceTab(1)
    c.pushOverlayBlock('splitter-drag')

    expect(webviewStyles(wv)).toEqual({
      display: 'none',
      pointerEvents: 'none',
      inert: true
    })
  })

  it('keeps webview visible but blocks input while a portal is open', () => {
    const c = freshCoordinator()
    const wv = registerBrowser()
    c.setActiveWorkspaceTab(1)
    c.registerPortal('menu', () => {})

    expect(webviewStyles(wv)).toEqual({
      display: 'flex',
      pointerEvents: 'none',
      inert: true
    })
  })

  it('locks webview input when pane visibility changes off', () => {
    const c = freshCoordinator()
    const wv = registerBrowser()
    c.setActiveWorkspaceTab(1)
    browserController!.setPaneChipState(1, 'browser-1', { paneVisible: false })

    expect(webviewStyles(wv)).toEqual({
      display: 'none',
      pointerEvents: 'none',
      inert: true
    })
  })

  it('locks sibling webview input when chip becomes inactive', () => {
    const c = freshCoordinator()
    const active = registerBrowser({ paneTabItemId: 'browser-a', chipActive: true })
    const hidden = registerBrowser({ paneTabItemId: 'browser-b', chipActive: false })
    c.setActiveWorkspaceTab(1)

    expect(webviewStyles(active).pointerEvents).toBe('auto')
    expect(webviewStyles(hidden).pointerEvents).toBe('none')
    browserController!.setPaneChipState(1, 'browser-b', { chipActive: true })
    expect(webviewStyles(active).pointerEvents).toBe('none')
    expect(webviewStyles(hidden).pointerEvents).toBe('auto')
  })

  it('focuses webview when chip becomes active and guest is interactive', async () => {
    const c = freshCoordinator()
    const wv = registerBrowser({ chipActive: false })
    c.setActiveWorkspaceTab(1)
    browserController!.setPaneChipState(1, 'browser-1', { chipActive: true })

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
    expect(wv.focus).toHaveBeenCalled()
  })

  it('focuses webview on register when chip and pane are already active', async () => {
    const c = freshCoordinator()
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    registerBrowserOverlaySlotViewport('pane-1', slot)
    const viewport = ensureBrowserPageViewport('browser-1', 'pane-1')
    if (!viewport) throw new Error('expected browser viewport')
    const wv = mockWebview()
    viewport.container.appendChild(wv)
    c.setActiveWorkspaceTab(1)
    browserController!.registerWebview(wv, {
      workspaceTabId: 1,
      paneNodeId: 'pane-1',
      paneTabItemId: 'browser-1',
      initialPaneVisible: true,
      initialChipActive: true
    })

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
    expect(wv.focus).toHaveBeenCalled()
  })

  it('does not focus webview when chip becomes active but guest is hidden', () => {
    const c = freshCoordinator()
    const wv = registerBrowser({ chipActive: false, paneVisible: false })
    c.setActiveWorkspaceTab(1)
    browserController!.setPaneChipState(1, 'browser-1', { chipActive: true })

    expect(wv.focus).not.toHaveBeenCalled()
  })

  it('cancels stale focus schedule when webview unregisters', async () => {
    const c = freshCoordinator()
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    registerBrowserOverlaySlotViewport('pane-1', slot)
    const viewport = ensureBrowserPageViewport('browser-1', 'pane-1')
    if (!viewport) throw new Error('expected browser viewport')
    const wv = mockWebview()
    viewport.container.appendChild(wv)
    c.setActiveWorkspaceTab(1)
    browserController!.registerWebview(wv, {
      workspaceTabId: 1,
      paneNodeId: 'pane-1',
      paneTabItemId: 'browser-1',
      initialPaneVisible: true,
      initialChipActive: true
    })
    ;(wv.focus as ReturnType<typeof vi.fn>).mockClear()
    browserController!.unregisterWebview(wv)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    expect(wv.focus).not.toHaveBeenCalled()
  })

  it('parks viewport shell on unregister', () => {
    const c = freshCoordinator()
    registerBrowser()
    c.setActiveWorkspaceTab(1)
    const wv = document.querySelector('webview') as Electron.WebviewTag
    browserController!.unregisterWebview(wv)

    const shell = document.querySelector<HTMLElement>('[data-browser-page-viewport-id="browser-1"]')
    expect(shell?.style.display).toBe('none')
    expect(c.getSnapshot().featureMetrics['browser.registeredWebviews']).toBe(0)
  })

  it('hides orphan webviews in the DOM', () => {
    const c = freshCoordinator()
    const orphan = mockWebview()
    const host = document.createElement('div')
    host.setAttribute('data-workspace-tab-id', '1')
    host.appendChild(orphan)
    document.body.appendChild(host)

    c.setActiveWorkspaceTab(1)
    c.reconcile('test-orphan')

    expect(webviewStyles(orphan)).toEqual({
      display: 'none',
      pointerEvents: 'none',
      inert: true
    })
  })

  it('restores webview interactivity after overlay pop', () => {
    const c = freshCoordinator()
    const wv = registerBrowser()
    c.setActiveWorkspaceTab(1)
    c.pushOverlayBlock('drag')
    c.popOverlayBlock('drag')

    expect(webviewStyles(wv).pointerEvents).toBe('auto')
  })
})
