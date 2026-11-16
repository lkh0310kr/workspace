import { useEffect } from 'react'
import {
  browserCleanupAll,
  installBrowserDownloadRelay,
  installBrowserEmbedSupport,
  reloadFocusedBrowser
} from '../features/browser/runtime'
import { installRendererConsoleFileLogging } from '../debug/consoleFileLog'
import {
  onBrowserReloadShortcut,
  onPastePlainTextShortcut,
  onTerminalPasteShortcut
} from '../electron'
import { pastePlainTextInFocusedEditor } from '../activeEditorView'
import { getRegisteredTerminalPane } from '@workspace/terminal/pane-manager/pane-terminal-registry'
import {
  captureTerminalSessionBuffers,
  notifyTerminalKeyboardPasteHandled,
  pasteClipboardIntoTerminal
} from '../features/terminal/runtime'
import { installGlobalErrorLogging } from '../errorLog'
import { installTerminalAgentStatusBridge } from '../features/terminal/runtime'

/** One-time app-wide side effects (logging, browser embed, downloads). */
export function useAppBootstrap(): void {
  useEffect(() => {
    void browserCleanupAll().catch(console.error)
  }, [])

  useEffect(() => installGlobalErrorLogging(), [])
  useEffect(() => {
    installRendererConsoleFileLogging()
  }, [])
  useEffect(() => installBrowserEmbedSupport(), [])
  useEffect(() => installBrowserDownloadRelay(), [])
  useEffect(() => installTerminalAgentStatusBridge(), [])
  useEffect(() => onBrowserReloadShortcut(({ hard }) => reloadFocusedBrowser(hard)), [])
  useEffect(() => onPastePlainTextShortcut(() => pastePlainTextInFocusedEditor()), [])
  useEffect(
    () =>
      onTerminalPasteShortcut(({ terminalId }) => {
        const pane = getRegisteredTerminalPane(terminalId)
        if (!pane) return
        notifyTerminalKeyboardPasteHandled()
        void pasteClipboardIntoTerminal({ terminal: pane.terminal })
      }),
    []
  )

  useEffect(
    () =>
      window.api.terminal.onCaptureSessionBuffers((terminalIds) => {
        const file = captureTerminalSessionBuffers(terminalIds)
        window.api.terminal.sendSessionBuffers(file)
      }),
    []
  )
}
