import type { TuiAgent } from './types/tuiAgent'
import type { ManagedPane } from './pane-manager/pane-manager-types'
import type { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import type { TerminalSearchDecorations } from './TerminalSearch'
import type { ResolvedTheme } from './terminalThemes'

export interface TerminalPtyTransport {
  connect: (callbacks: {
    onData: (data: string, seq: number) => void
    onWriteUnavailable?: () => void
  }) => Promise<{
    id: number
    snapshot: string
    snapshotCols: number
    snapshotRows: number
    lastSeq: number
    isReattach: boolean
  }>
  activate: () => void
  disconnect: () => void
  write: (data: string) => void
  writeQueryReply: (data: string) => void
}

export interface TerminalPaneHost {
  registerPortal: (id: string, onDismiss: () => void) => () => void
  getPlatformInfo: () => {
    platform: string
    osRelease: string
    displayServer?: 'wayland' | 'x11' | null
  }
  getResolvedTheme: () => ResolvedTheme
  getXtermTheme: (theme: ResolvedTheme) => ITheme
  getSearchDecorations: (theme: ResolvedTheme) => TerminalSearchDecorations
  subscribeThemeChange: (listener: (theme: ResolvedTheme) => void) => () => void
  resolveTitleAgentType: (title: string) => TuiAgent | null
  openLink: (url: string) => void
  focusTextarea: (container: HTMLElement | null) => void
  requestKeyboardSurface: (surface: 'terminal', reason: string) => void
  registerKeyboardTarget: (terminalId: number, blur: () => void) => () => void
  installInputHandlers: (args: {
    terminal: Terminal
    container: HTMLElement
    terminalId: number
    transport: TerminalPtyTransport
    getTerminalAgent: () => TuiAgent | null | undefined
    writeClipboardText: (text: string) => void
    isFocused: () => boolean
  }) => () => void
  log: (
    location: string,
    message: string,
    data?: Record<string, unknown>,
    terminalId?: number
  ) => void
  setFocusedTerminal: (terminalId: number | null) => void
  registerAgentPane: (
    terminalId: number,
    workspaceTabId: number,
    paneTabId: string,
    terminalAgent?: TuiAgent
  ) => void
  unregisterAgentPane: (terminalId: number) => void
  registerLiveTerminal: (terminalId: number) => void
  writeClipboardText: (text: string) => void
  ensureAgentWorking: (workspaceTabId: number, paneTabId: string, terminalAgent?: TuiAgent) => void
  connectPty: (
    pane: ManagedPane,
    terminalId: number,
    options: {
      workspaceTabId: number
      paneTabId: string
      terminalAgent?: TuiAgent
      onTitleChange: (title: string) => void
    }
  ) => { transport: TerminalPtyTransport; dispose: () => void }
}
