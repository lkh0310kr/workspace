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
  return /^Digit[1-9]$/.test(input.code) || /^[1-9]$/.test(input.key ?? '')
}

function isHomeKey(input: Input): boolean {
  // `code` is layout independent; `key` covers Electron/macOS variants that
  // report the produced punctuation without a usable physical code.
  return input.code === 'Backquote' || input.key === '`'
}

function workspaceModifierName(): 'Meta' | 'Control' {
  return process.platform === 'darwin' ? 'Meta' : 'Control'
}

function isModifierRelease(input: Input): boolean {
  if (input.type !== 'keyUp') return false
  const modifierName = workspaceModifierName()
  // Electron can report the modifier flags from before the key was released.
  // The physical code identifies the released key even in that case.
  if (input.code === `${modifierName}Left` || input.code === `${modifierName}Right`) return true
  if (input.key === modifierName) return true
  // Some focused web contents omit the physical key code for the modifier-up
  // event. Any key-up observed with the app shortcut modifier no longer held
  // is sufficient to clear the titlebar's temporary number hints.
  return modifierName === 'Meta' ? input.meta !== true : input.control !== true
}

function isModifierPress(input: Input): boolean {
  if (input.type !== 'keyDown') return false
  const modifierName = workspaceModifierName()
  return (
    input.code === `${modifierName}Left` ||
    input.code === `${modifierName}Right` ||
    input.key === modifierName
  )
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
  if (isHomeKey(input) && (input.control || input.meta) && !input.shift && !input.alt) {
    event.preventDefault()
    send('shortcut:home')
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
  if (input.type === 'keyUp') {
    if (isModifierRelease(input)) options.send('shortcut:modifier-released')
    return
  }
  if (input.type !== 'keyDown') return
  if (isModifierPress(input)) {
    options.send('shortcut:modifier-pressed')
    return
  }

  relaySharedRendererShortcuts(event, input, options.send, {
    gateBrowserReload: options.terminalOwnsAppShortcuts,
  })

  // Chromium consumes Cmd/Ctrl+P for print before a renderer keydown handler
  // can reliably see it. Route editor search shortcuts at Electron's input
  // boundary, the same way the workspace's other app shortcuts are routed.
  if ((input.meta || input.control) && !input.alt && input.code === 'KeyP' && !input.shift) {
    event.preventDefault()
    options.send('shortcut:quick-open')
    return
  }
  if ((input.meta || input.control) && !input.alt && input.code === 'KeyF' && input.shift) {
    event.preventDefault()
    options.send('shortcut:find-in-files')
    return
  }
  if ((input.meta || input.control) && !input.alt && input.code === 'KeyF' && !input.shift) {
    event.preventDefault()
    options.send('shortcut:find-in-editor')
    return
  }

  if (isWorkspaceTabIndexInput(input)) {
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
  if (input.type === 'keyUp') {
    if (isModifierRelease(input)) send('shortcut:modifier-released')
    return
  }
  if (input.type !== 'keyDown') return
  if (isModifierPress(input)) {
    send('shortcut:modifier-pressed')
    return
  }

  if (isHomeKey(input) && (input.control || input.meta) && !input.shift && !input.alt) {
    event.preventDefault()
    send('shortcut:home')
    return
  }

  relaySharedRendererShortcuts(event, input, send, { gateBrowserReload: false })

  if (isWorkspaceTabIndexInput(input)) {
    send('shortcut:switch-workspace-tab-index', { index: Number(input.code.at(-1) ?? input.key) })
    return
  }

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
