import { useEffect } from 'react'
import { getRegisteredTerminalPane } from '@workspace/terminal/pane-manager'
import {
  captureTerminalSessionBuffers,
  notifyTerminalKeyboardPasteHandled,
  pasteClipboardIntoTerminal
} from './runtime'
import { onTerminalPasteShortcut } from './runtime/terminalIpc'

export function useTerminalInputBootstrap(): void {
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
