import { describe, expect, it, vi } from 'vitest'
import { readBrowserNavigationState } from './browserNavigationState'

describe('readBrowserNavigationState', () => {
  it('does not call a webview before DOM ready', () => {
    const target = {
      isConnected: true,
      canGoBack: vi.fn(() => true),
      canGoForward: vi.fn(() => false)
    }

    expect(readBrowserNavigationState(target, false)).toEqual({
      canGoBack: false,
      canGoForward: false
    })
    expect(target.canGoBack).not.toHaveBeenCalled()
    expect(target.canGoForward).not.toHaveBeenCalled()
  })

  it('does not call a detached webview', () => {
    const target = {
      isConnected: false,
      canGoBack: vi.fn(() => true),
      canGoForward: vi.fn(() => false)
    }

    expect(readBrowserNavigationState(target, true)).toEqual({
      canGoBack: false,
      canGoForward: false
    })
    expect(target.canGoBack).not.toHaveBeenCalled()
  })

  it('reads navigation state from an attached ready webview', () => {
    const target = { isConnected: true, canGoBack: () => true, canGoForward: () => false }

    expect(readBrowserNavigationState(target, true)).toEqual({
      canGoBack: true,
      canGoForward: false
    })
  })

  it('contains Electron teardown exceptions', () => {
    const target = {
      isConnected: true,
      canGoBack: () => {
        throw new Error('WebView is not attached')
      },
      canGoForward: () => false
    }

    expect(readBrowserNavigationState(target, true)).toEqual({
      canGoBack: false,
      canGoForward: false
    })
  })
})
