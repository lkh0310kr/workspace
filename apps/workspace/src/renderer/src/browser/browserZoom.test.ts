import { describe, expect, it, vi } from 'vitest'
import {
  applyBrowserZoomToWebview,
  registerBrowserZoomPersist,
  BROWSER_ZOOM_MAX,
  BROWSER_ZOOM_MIN,
} from './browserZoom'

function mockWebview(factor: number, tabItemId = 'tab-1') {
  let zoom = factor
  const webview = {
    getZoomFactor: () => zoom,
    setZoomFactor: (next: number) => {
      zoom = next
    },
    dataset: { tabItemId },
  } as unknown as Electron.WebviewTag
  return { webview, getZoom: () => zoom }
}

describe('applyBrowserZoomToWebview', () => {
  it('steps zoom in and persists via handler', () => {
    const { webview, getZoom } = mockWebview(1)
    const persist = vi.fn()
    registerBrowserZoomPersist('tab-1', persist)
    const next = applyBrowserZoomToWebview(webview, 'in')
    expect(next).toBeCloseTo(1.1)
    expect(getZoom()).toBeCloseTo(1.1)
    expect(persist).toHaveBeenCalledWith(1.1)
  })

  it('clamps at min/max', () => {
    const { webview: atMin } = mockWebview(BROWSER_ZOOM_MIN)
    expect(applyBrowserZoomToWebview(atMin, 'out')).toBe(BROWSER_ZOOM_MIN)
    const { webview: atMax } = mockWebview(BROWSER_ZOOM_MAX)
    expect(applyBrowserZoomToWebview(atMax, 'in')).toBe(BROWSER_ZOOM_MAX)
  })
})
