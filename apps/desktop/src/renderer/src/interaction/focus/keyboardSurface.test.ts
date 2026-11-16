import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerKeyboardSurfaceRelease, requestKeyboardSurface } from './keyboardSurface'

describe('keyboard surface handoff', () => {
  const unregister: Array<() => void> = []

  afterEach(() => {
    for (const dispose of unregister.splice(0)) dispose()
  })

  it('releases only host surfaces that yield to the requested owner', () => {
    const releaseBrowser = vi.fn()
    const releaseTerminal = vi.fn()
    const releaseUnrelated = vi.fn()
    unregister.push(
      registerKeyboardSurfaceRelease('browser', ['terminal'], releaseBrowser),
      registerKeyboardSurfaceRelease('terminal', ['browser'], releaseTerminal)
    )

    requestKeyboardSurface('browser', 'browser-focus')
    expect(releaseTerminal).toHaveBeenCalledOnce()
    expect(releaseTerminal).toHaveBeenCalledWith('browser-focus')
    expect(releaseBrowser).not.toHaveBeenCalled()

    unregister.push(registerKeyboardSurfaceRelease('terminal', [], releaseUnrelated))
    requestKeyboardSurface('terminal', 'terminal-focus')
    expect(releaseBrowser).toHaveBeenCalledOnce()
    expect(releaseBrowser).toHaveBeenCalledWith('terminal-focus')
    expect(releaseUnrelated).not.toHaveBeenCalled()
  })
})
