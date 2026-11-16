import {
  DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT,
  serializeWithAbsoluteCursor,
  trimTerminalSessionBufferToByteLimit,
  type TerminalSessionBuffersFile
} from '../shared'
import type { ManagedPaneInternal } from './pane-manager-types'
import { flushTerminalOutput } from './pane-terminal-output-scheduler'
import { forEachRegisteredTerminalPane, getRegisteredTerminalPane } from './pane-terminal-registry'

function capturePaneBuffer(pane: ManagedPaneInternal): string {
  flushTerminalOutput(pane.terminal)
  const serialized = serializeWithAbsoluteCursor(pane.serializeAddon, pane.terminal, {
    scrollback: DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT
  })
  if (!serialized) return ''
  return trimTerminalSessionBufferToByteLimit(serialized)
}

/** Serialize mounted terminal panes for quit-time persistence. */
export function captureTerminalSessionBuffers(
  terminalIds?: readonly number[]
): TerminalSessionBuffersFile {
  const buffersByTerminalId: Record<string, string> = {}
  const captureId = (terminalId: number): void => {
    const pane = getRegisteredTerminalPane(terminalId)
    if (!pane) return
    const serialized = capturePaneBuffer(pane)
    if (serialized) buffersByTerminalId[String(terminalId)] = serialized
  }

  if (terminalIds && terminalIds.length > 0) {
    for (const id of terminalIds) captureId(id)
  } else {
    forEachRegisteredTerminalPane((terminalId, pane) => {
      const serialized = capturePaneBuffer(pane)
      if (serialized) buffersByTerminalId[String(terminalId)] = serialized
    })
  }

  return { buffersByTerminalId }
}
