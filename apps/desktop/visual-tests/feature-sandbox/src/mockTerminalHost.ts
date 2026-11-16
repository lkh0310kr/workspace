import {
  getTerminalSearchDecorations,
  XTERM_THEMES
} from '@workspace/terminal'
import type { TerminalPaneHost, TerminalPtyTransport } from '@workspace/terminal'
import { writeTerminalOutput } from '@workspace/terminal/pane-manager'
import type { ManagedPane } from '@workspace/terminal/pane-manager'

export function createMemoryTerminalHost(): TerminalPaneHost {
  let nextTerminalId = 1

  return {
    async spawnTerminal() {
      return nextTerminalId++
    },
    registerPortal: () => () => undefined,
    getPlatformInfo: () => ({ platform: 'sandbox', osRelease: '0.1' }),
    getResolvedTheme: () => 'dark',
    getXtermTheme: (theme) => XTERM_THEMES[theme],
    getSearchDecorations: (theme) => getTerminalSearchDecorations(theme),
    subscribeThemeChange: () => () => undefined,
    resolveTitleAgentType: () => null,
    openLink: () => undefined,
    focusTextarea: (container) => container?.querySelector('textarea')?.focus(),
    requestKeyboardSurface: () => undefined,
    registerKeyboardTarget: () => () => undefined,
    installInputHandlers: ({ terminal, transport }) => {
      const input = terminal.onData((data) => transport.write(data))
      return () => input.dispose()
    },
    log: () => undefined,
    setFocusedTerminal: () => undefined,
    registerAgentPane: () => undefined,
    unregisterAgentPane: () => undefined,
    registerLiveTerminal: () => undefined,
    writeClipboardText: async () => undefined,
    ensureAgentWorking: () => undefined,
    connectPty(pane: ManagedPane) {
      let onData: ((data: string, seq: number) => void) | undefined
      let disposed = false
      let sequence = 0
      let inputBuffer = ''
      const transport: TerminalPtyTransport = {
        async connect(callbacks) {
          onData = callbacks.onData
          queueMicrotask(() => {
            if (disposed) return
            onData?.('Mock terminal ready.\r\n$ ', ++sequence)
          })
          return {
            id: nextTerminalId,
            snapshot: '',
            snapshotCols: 80,
            snapshotRows: 24,
            lastSeq: sequence,
            isReattach: false
          }
        },
        activate: () => undefined,
        disconnect: () => undefined,
        write(data) {
          if (disposed) return
          for (const character of data) {
            if (character === '\r' || character === '\n') {
              onData?.(`${inputBuffer}\r\n$ `, ++sequence)
              inputBuffer = ''
            } else if (character === '\x7f' || character === '\b') {
              inputBuffer = inputBuffer.slice(0, -1)
            } else {
              inputBuffer += character
            }
          }
        },
        writeQueryReply: () => undefined
      }
      void transport
        .connect({
          onData: (data) => {
            if (!disposed) writeTerminalOutput(pane.terminal, data, { foreground: true })
          }
        })
        .then((result) => {
          if (disposed) return
          if (result.snapshot) {
            writeTerminalOutput(pane.terminal, result.snapshot, { foreground: true })
          }
          transport.activate()
        })
      return { transport, dispose: () => { disposed = true; onData = undefined } }
    }
  }
}
