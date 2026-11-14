import { describe, expect, it, vi } from 'vitest'
import { relayGuestWebviewShortcuts, relayHostAppShortcuts } from './relayAppShortcuts'

function keyDown(
  code: string,
  modifiers: { meta?: boolean; control?: boolean; shift?: boolean } = {}
) {
  return {
    type: 'keyDown' as const,
    code,
    meta: modifiers.meta ?? false,
    control: modifiers.control ?? false,
    shift: modifiers.shift ?? false
  }
}

function keyUp(code: string, modifiers: { meta?: boolean; control?: boolean } = {}) {
  return {
    type: 'keyUp' as const,
    code,
    meta: modifiers.meta ?? false,
    control: modifiers.control ?? false
  }
}

function mockEvent() {
  return { preventDefault: vi.fn() }
}

describe('relayHostAppShortcuts', () => {
  it('shows tab numbers as soon as the Meta key is pressed', () => {
    const send = vi.fn()
    relayHostAppShortcuts(mockEvent() as never, keyDown('MetaLeft') as never, {
      send,
      terminalOwnsAppShortcuts: false,
      focusedTerminalId: null
    })
    expect(send).toHaveBeenCalledWith('shortcut:modifier-pressed')
  })

  it('clears tab shortcut hints when the Meta key is released even if Electron keeps its flag set', () => {
    const send = vi.fn()
    relayHostAppShortcuts(mockEvent() as never, keyUp('MetaLeft', { meta: true }) as never, {
      send,
      terminalOwnsAppShortcuts: false,
      focusedTerminalId: null
    })
    expect(send).toHaveBeenCalledWith('shortcut:modifier-released')
  })

  it('does not end the held modifier state when a digit key is released', () => {
    const send = vi.fn()
    relayHostAppShortcuts(mockEvent() as never, keyUp('Digit2') as never, {
      send,
      terminalOwnsAppShortcuts: false,
      focusedTerminalId: null
    })
    expect(send).not.toHaveBeenCalledWith('shortcut:modifier-released')
  })

  it('relays browser reload when terminal does not own shortcuts', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('KeyR', { meta: true }) as never, {
      send,
      terminalOwnsAppShortcuts: false,
      focusedTerminalId: null
    })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:browser-reload', { hard: false })
  })

  it('skips browser reload while terminal owns shortcuts', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('KeyR', { meta: true }) as never, {
      send,
      terminalOwnsAppShortcuts: true,
      focusedTerminalId: 3
    })
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('always relays close-tab on Cmd+W', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('KeyW', { meta: true }) as never, {
      send,
      terminalOwnsAppShortcuts: true,
      focusedTerminalId: 3
    })
    expect(send).toHaveBeenCalledWith('shortcut:close-pane-tab')
  })

  it('relays paste-plain-text when no terminal is focused', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('KeyV', { meta: true, shift: true }) as never, {
      send,
      terminalOwnsAppShortcuts: false,
      focusedTerminalId: null
    })
    expect(send).toHaveBeenCalledWith('shortcut:paste-plain-text')
  })

  it('relays terminal paste when a terminal owns focus', () => {
    const event = mockEvent()
    const send = vi.fn()
    const modifiers = process.platform === 'darwin' ? { meta: true } : { control: true }
    relayHostAppShortcuts(event as never, keyDown('KeyV', modifiers) as never, {
      send,
      terminalOwnsAppShortcuts: true,
      focusedTerminalId: 7
    })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:terminal-paste', { terminalId: 7 })
  })

  it('relays new workspace tab on Cmd+N while terminal owns browser reload', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('KeyN', { meta: true }) as never, {
      send,
      terminalOwnsAppShortcuts: true,
      focusedTerminalId: 3
    })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:new-workspace-tab')
  })

  it('routes Cmd+P to Quick Open before Chromium handles print', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('KeyP', { meta: true }) as never, {
      send,
      terminalOwnsAppShortcuts: false,
      focusedTerminalId: null
    })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:quick-open')
  })

  it('routes Cmd+Shift+F to Find in Files', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('KeyF', { meta: true, shift: true }) as never, {
      send,
      terminalOwnsAppShortcuts: false,
      focusedTerminalId: null
    })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:find-in-files')
  })

  it('routes Cmd+F to the focused editor instead of Chromium Find', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('KeyF', { meta: true }) as never, {
      send,
      terminalOwnsAppShortcuts: false,
      focusedTerminalId: null
    })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:find-in-editor')
  })

  it('relays workspace tab index on Cmd+digit while terminal is focused', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('Digit2', { meta: true }) as never, {
      send,
      terminalOwnsAppShortcuts: true,
      focusedTerminalId: 3
    })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:switch-workspace-tab-index', { index: 2 })
    expect(send).not.toHaveBeenCalledWith('shortcut:modifier-released')
  })
})

describe('relayGuestWebviewShortcuts', () => {
  it('shows tab numbers while Meta is held in a browser guest', () => {
    const send = vi.fn()
    relayGuestWebviewShortcuts(
      mockEvent() as never,
      keyDown('MetaRight') as never,
      send,
      vi.fn(),
      42
    )
    expect(send).toHaveBeenCalledWith('shortcut:modifier-pressed')
  })

  it('clears tab shortcut hints when the Meta key is released in a guest webview', () => {
    const send = vi.fn()
    relayGuestWebviewShortcuts(
      mockEvent() as never,
      keyUp('MetaRight', { meta: true }) as never,
      send,
      vi.fn(),
      42
    )
    expect(send).toHaveBeenCalledWith('shortcut:modifier-released')
  })

  it('relays browser reload and invokes guest plain paste', () => {
    const event = mockEvent()
    const send = vi.fn()
    const onPastePlainText = vi.fn()
    relayGuestWebviewShortcuts(
      event as never,
      keyDown('KeyV', { meta: true, shift: true }) as never,
      send,
      onPastePlainText,
      42
    )
    expect(onPastePlainText).toHaveBeenCalled()
    expect(send).not.toHaveBeenCalledWith('shortcut:paste-plain-text')
  })

  it('relays browser zoom from guest focus', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayGuestWebviewShortcuts(
      event as never,
      keyDown('Equal', { meta: true }) as never,
      send,
      vi.fn(),
      42
    )
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:browser-zoom', {
      direction: 'in',
      webContentsId: 42
    })
  })
})
