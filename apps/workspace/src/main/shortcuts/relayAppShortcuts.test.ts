import { describe, expect, it, vi } from 'vitest'
import { relayGuestWebviewShortcuts, relayHostAppShortcuts } from './relayAppShortcuts'

function keyDown(
  code: string,
  modifiers: { meta?: boolean; control?: boolean; shift?: boolean } = {},
) {
  return {
    type: 'keyDown' as const,
    code,
    meta: modifiers.meta ?? false,
    control: modifiers.control ?? false,
    shift: modifiers.shift ?? false,
  }
}

function mockEvent() {
  return { preventDefault: vi.fn() }
}

describe('relayHostAppShortcuts', () => {
  it('relays browser reload when terminal does not own shortcuts', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('KeyR', { meta: true }) as never, {
      send,
      terminalOwnsAppShortcuts: false,
      focusedTerminalId: null,
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
      focusedTerminalId: 3,
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
      focusedTerminalId: 3,
    })
    expect(send).toHaveBeenCalledWith('shortcut:close-pane-tab')
  })

  it('relays paste-plain-text when no terminal is focused', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('KeyV', { meta: true, shift: true }) as never, {
      send,
      terminalOwnsAppShortcuts: false,
      focusedTerminalId: null,
    })
    expect(send).toHaveBeenCalledWith('shortcut:paste-plain-text')
  })

  it('relays terminal paste when a terminal owns focus', () => {
    const event = mockEvent()
    const send = vi.fn()
    const modifiers =
      process.platform === 'darwin' ? { meta: true } : { control: true }
    relayHostAppShortcuts(event as never, keyDown('KeyV', modifiers) as never, {
      send,
      terminalOwnsAppShortcuts: true,
      focusedTerminalId: 7,
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
      focusedTerminalId: 3,
    })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:new-workspace-tab')
  })

  it('relays workspace tab index on Cmd+digit while terminal is focused', () => {
    const event = mockEvent()
    const send = vi.fn()
    relayHostAppShortcuts(event as never, keyDown('Digit2', { meta: true }) as never, {
      send,
      terminalOwnsAppShortcuts: true,
      focusedTerminalId: 3,
    })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:switch-workspace-tab-index', { index: 2 })
  })
})

describe('relayGuestWebviewShortcuts', () => {
  it('relays browser reload and invokes guest plain paste', () => {
    const event = mockEvent()
    const send = vi.fn()
    const onPastePlainText = vi.fn()
    relayGuestWebviewShortcuts(
      event as never,
      keyDown('KeyV', { meta: true, shift: true }) as never,
      send,
      onPastePlainText,
      42,
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
      42,
    )
    expect(event.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('shortcut:browser-zoom', { direction: 'in', webContentsId: 42 })
  })
})
