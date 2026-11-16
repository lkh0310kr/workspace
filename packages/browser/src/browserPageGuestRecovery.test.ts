/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ensureBrowserPageViewport,
  registerBrowserOverlaySlotViewport,
  resetBrowserPageViewportsForTests
} from './browserPageViewport'
import { browserPageGuestNeedsAttach, resolveBrowserPageWebview } from './browserPageGuestRecovery'

function createWebview(): Electron.WebviewTag {
  return Object.assign(document.createElement('webview'), {
    getWebContentsId: vi.fn(() => 7),
    style: {} as CSSStyleDeclaration
  }) as Electron.WebviewTag
}

describe('browserPageGuestRecovery', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    resetBrowserPageViewportsForTests()
  })

  it('detects a registry guest that drifted out of its page container', () => {
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    registerBrowserOverlaySlotViewport('pane-1', slot)
    const viewport = ensureBrowserPageViewport('page-1', 'pane-1')!
    const webview = createWebview()
    viewport.container.appendChild(webview)

    expect(browserPageGuestNeedsAttach('page-1', webview, () => webview)).toBe(false)

    const orphanHost = document.createElement('div')
    document.body.appendChild(orphanHost)
    orphanHost.appendChild(webview)
    expect(browserPageGuestNeedsAttach('page-1', webview, () => webview)).toBe(true)
  })

  it("resolves a connected registry guest when React's ref is stale", () => {
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    registerBrowserOverlaySlotViewport('pane-1', slot)
    const viewport = ensureBrowserPageViewport('page-1', 'pane-1')!
    const webview = createWebview()
    viewport.container.appendChild(webview)

    const ref = { current: null as Electron.WebviewTag | null }
    expect(resolveBrowserPageWebview('page-1', ref, () => webview)).toBe(webview)
    expect(ref.current).toBe(webview)
  })
})
