import type { TuiAgent } from './types/tuiAgent'
import type { ManagedPane } from './pane-manager/pane-manager-types'

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
  getPlatformInfo: () => { platform: string; osRelease: string }
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
