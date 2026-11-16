/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestKeyboardSurface } from '../interaction/keyboardSurface'
import { registerTerminalKeyboardTarget } from './terminalKeyboardSurface'

// Importing the terminal feature installs its host release adapter.
import './terminalKeyboardSurface'

describe('terminal keyboard surface', () => {
  const unregister: Array<() => void> = []

  afterEach(() => {
    for (const dispose of unregister.splice(0)) dispose()
    delete (window as unknown as { api?: unknown }).api
  })

  it('blurs mounted terminal surfaces and clears Main keyboard ownership once', () => {
    const setFocused = vi.fn()
    ;(window as unknown as { api: unknown }).api = { terminal: { setFocused } }
    const releaseOne = vi.fn()
    const releaseTwo = vi.fn()
    unregister.push(
      registerTerminalKeyboardTarget(1, releaseOne),
      registerTerminalKeyboardTarget(2, releaseTwo)
    )

    requestKeyboardSurface('browser', 'browser-focus')

    expect(releaseOne).toHaveBeenCalledOnce()
    expect(releaseTwo).toHaveBeenCalledOnce()
    expect(setFocused).toHaveBeenCalledOnce()
    expect(setFocused).toHaveBeenCalledWith(null)
  })
})
