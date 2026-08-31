import type { Event, Input } from 'electron'
import { isImeToggleKey } from '../imeEnv'

export type ShortcutSend = (channel: string, ...args: unknown[]) => void

/** Cmd/Ctrl+V while a terminal pane owns focus — xterm has no native editable, so route paste explicitly. */
export function isTerminalPasteInput(input: Input): boolean {
  if (input.type !== 'keyDown') return false
  if (input.shift || input.alt) return false
  if (input.code !== 'KeyV' && input.key?.toLowerCase() !== 'v') return false
  if (process.platform === 'darwin') {
    return input.meta && !input.control
  }
  return input.control && !input.meta
}

/** Cmd/Ctrl +/- — browser page zoom; guest focus never reaches the renderer. */
export function browserZoomDirectionFromInput(input: Input): 'in' | 'out' | null {
  if (input.type !== 'keyDown') return null
  if (input.alt) return null
  if (!(input.control || input.meta)) return null
  if (input.code === 'Equal' || input.code === 'NumpadAdd') return 'in'
  if (input.code === 'Minus' || input.code === 'NumpadSubtract') return 'out'
  return null
}

/** Cmd/Ctrl+1..9 — workspace tab switch; must be relayed while terminal owns focus. */
export function isWorkspaceTabIndexInput(input: Input): boolean {
  if (input.type !== 'keyDown') return false
  if (input.shift || input.alt) return false
  if (!(input.control || input.meta)) return false
  return /^Digit[1-9]$/.test(input.code)
}

type SharedRelayOptions = {
  /** When true, Cmd+R stays with the focused terminal (readline/vim redo). */
  gateBrowserReload: boolean
}

function relaySharedRendererShortcuts(
  event: Event,
  input: Input,
  send: ShortcutSend,
  options: SharedRelayOptions,
): void {
  if (!options.gateBrowserReload && input.code === 'KeyR' && (input.control || input.meta)) {
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
  if (input.code === 'KeyN' && (input.control || input.meta)) {
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

/** Host renderer window — respects terminal-owned Cmd+R; relays paste and workspace shortcuts. */
export function relayHostAppShortcuts(
  event: Event,
  input: Input,
  options: HostShortcutRelayOptions,
): void {
  if (isImeToggleKey(input)) return
  if (input.type !== 'keyDown') return

  relaySharedRendererShortcuts(event, input, options.send, {
    gateBrowserReload: options.terminalOwnsAppShortcuts,
  })

  if (isWorkspaceTabIndexInput(input)) {
    event.preventDefault()
    options.send('shortcut:switch-workspace-tab-index', { index: Number(input.code.at(-1)) })
    return
  }

  if (
    options.focusedTerminalId !== null &&
    isTerminalPasteInput(input)
  ) {
    event.preventDefault()
    options.send('shortcut:terminal-paste', { terminalId: options.focusedTerminalId })
    return
  }

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
  webContentsId: number,
): void {
  if (isImeToggleKey(input)) return
  if (input.type !== 'keyDown') return

  relaySharedRendererShortcuts(event, input, send, { gateBrowserReload: false })

  const zoomDirection = browserZoomDirectionFromInput(input)
  if (zoomDirection) {
    event.preventDefault()
    send('shortcut:browser-zoom', { direction: zoomDirection, webContentsId })
    return
  }

  if (input.code === 'KeyV' && (input.control || input.meta) && input.shift) {
    event.preventDefault()
    onPastePlainText()
  }
}
