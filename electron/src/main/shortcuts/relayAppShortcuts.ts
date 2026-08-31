import type { Event, Input } from 'electron'
import { isImeToggleKey } from '../imeEnv'

export type ShortcutSend = (channel: string, ...args: unknown[]) => void

type SharedRelayOptions = {
  /** When true, Cmd+R/Cmd+N stay with the focused terminal (readline/vim). */
  gateBrowserAndNewTab: boolean
}

function relaySharedRendererShortcuts(
  event: Event,
  input: Input,
  send: ShortcutSend,
  options: SharedRelayOptions,
): void {
  if (!options.gateBrowserAndNewTab && input.code === 'KeyR' && (input.control || input.meta)) {
    event.preventDefault()
    send('shortcut:browser-reload', { hard: input.shift })
  }
  if (input.code === 'KeyW' && (input.control || input.meta) && !input.shift) {
    event.preventDefault()
    send('shortcut:close-pane-tab')
  }
  if (input.code === 'Comma' && (input.control || input.meta)) {
    event.preventDefault()
    send('shortcut:open-settings')
  }
  if (!options.gateBrowserAndNewTab && input.code === 'KeyN' && (input.control || input.meta)) {
    event.preventDefault()
    send('shortcut:new-workspace-tab')
  }
}

export type HostShortcutRelayOptions = {
  send: ShortcutSend
  terminalOwnsAppShortcuts: boolean
  focusedTerminalId: number | null
  onTerminalOptionShortcut?: (event: Event, input: Input, terminalId: number) => void
}

/** Host renderer window — respects terminal-owned Cmd+R/Cmd+N and editor paste relay. */
export function relayHostAppShortcuts(
  event: Event,
  input: Input,
  options: HostShortcutRelayOptions,
): void {
  if (isImeToggleKey(input)) return
  if (input.type !== 'keyDown') return

  relaySharedRendererShortcuts(event, input, options.send, {
    gateBrowserAndNewTab: options.terminalOwnsAppShortcuts,
  })

  if (
    options.focusedTerminalId === null &&
    input.code === 'KeyV' &&
    (input.control || input.meta) &&
    input.shift
  ) {
    event.preventDefault()
    options.send('shortcut:paste-plain-text')
  }

  if (options.focusedTerminalId !== null && options.onTerminalOptionShortcut) {
    options.onTerminalOptionShortcut(event, input, options.focusedTerminalId)
  }
}

/** Browser <webview> guest — always relays app shortcuts; paste stays in-guest as plain text. */
export function relayGuestWebviewShortcuts(
  event: Event,
  input: Input,
  send: ShortcutSend,
  onPastePlainText: () => void,
): void {
  if (isImeToggleKey(input)) return
  if (input.type !== 'keyDown') return

  relaySharedRendererShortcuts(event, input, send, { gateBrowserAndNewTab: false })

  if (input.code === 'KeyV' && (input.control || input.meta) && input.shift) {
    event.preventDefault()
    onPastePlainText()
  }
}
