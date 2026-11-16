import { useEffect } from 'react'
import {
  installBrowserDownloadRelay,
  installBrowserEmbedSupport,
  reloadFocusedBrowser
} from '../../adapters/browser'
import { installRendererConsoleFileLogging } from '../../debug/consoleFileLog'
import { onPastePlainTextShortcut } from '../editor/runtime/editorShortcuts'
import { onTerminalPasteShortcut } from '../../adapters/terminal/runtime/terminalIpc'
import { onBrowserReloadShortcut } from '../../adapters/browser/runtime/browserIpc'
import { pastePlainTextInFocusedEditor } from '@renderer/features/editor/api'
import { getRegisteredTerminalPane } from '@workspace/terminal/pane-manager'
import {
  captureTerminalSessionBuffers,
  notifyTerminalKeyboardPasteHandled,
  pasteClipboardIntoTerminal
} from '../../adapters/terminal'
import { installGlobalErrorLogging } from '@renderer/features/diagnostics'
import { installTerminalAgentStatusBridge } from '../../adapters/terminal'

/** One-time app-wide side effects (logging, browser embed, downloads). */
export function useAppBootstrap(): void {
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
