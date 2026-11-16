import {
  getTerminalSearchDecorations,
  XTERM_THEMES
} from '@workspace/terminal'
import type { TerminalPaneHost, TerminalPtyTransport } from '@workspace/terminal'

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
    installInputHandlers: () => () => undefined,
    log: () => undefined,
    setFocusedTerminal: () => undefined,
    registerAgentPane: () => undefined,
    unregisterAgentPane: () => undefined,
    registerLiveTerminal: () => undefined,
    writeClipboardText: async () => undefined,
    ensureAgentWorking: () => undefined,
    connectPty() {
      let onData: ((data: string, seq: number) => void) | undefined
      let disposed = false
      let sequence = 0
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
          const normalized = data.replace(/\r/g, '')
          if (normalized) onData?.(`${normalized}\r\n$ `, ++sequence)
        },
        writeQueryReply: () => undefined
      }
      return { transport, dispose: () => { disposed = true; onData = undefined } }
    }
  }
}
