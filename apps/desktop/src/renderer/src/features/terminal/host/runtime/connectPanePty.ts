import type { IDisposable } from '@xterm/xterm'
import type {
  ManagedPane,
  ManagedPaneInternal
} from '@workspace/terminal/pane-manager'
import { setPaneFitListener } from '@workspace/terminal/pane-manager'
import { refitPaneTerminal } from '@workspace/terminal/pane-manager'
import { writeTerminalOutput } from '@workspace/terminal/pane-manager'
import { writeClipboardText } from '@renderer/adapters/platform/nativeClipboard'
import { ptyResize } from './terminalIpc'
import { createElectronPtyTransport, type PtyTransport } from './ptyTransport'
import { createPtyOutputTitleObserver } from '@workspace/terminal/agent'
import type { TuiAgent } from '@workspace/terminal/agent'
import {
  applyTitleDerivedAgentStatus,
  applyTitleIdleTransition,
  clearTitleDerivedOnAgentExit
} from '@workspace/terminal/agent'
import { runtimeTerminalTitlesStore } from '@workspace/terminal'
import {
  markTerminalBracketedPasteInterrupted,
  observeTerminalBracketedPasteModeOutput
} from '@workspace/terminal'
import { forwardXtermInputToPty } from './forward-xterm-input-to-pty'
import { reprTerminalBytes, termLog } from './terminalDebugLog'

export function connectPanePty(
  pane: ManagedPane,
  terminalId: number,
  options?: {
    workspaceTabId?: number
    paneTabId?: string
    terminalAgent?: TuiAgent
    onTitleChange?: (title: string) => void
  }
): {
  transport: PtyTransport
  dispose: () => void
} {
  const transport = createElectronPtyTransport(terminalId)
  const internal = pane as ManagedPaneInternal
  const term = pane.terminal
  let onDataDisposable: IDisposable | null = null
  let oscDisposable: IDisposable | null = null

  const titleObserver =
    options?.onTitleChange || options?.workspaceTabId !== undefined
      ? createPtyOutputTitleObserver({
          onTitleChange: (normalized, raw) => {
            if (options?.workspaceTabId !== undefined && options.paneTabId) {
              runtimeTerminalTitlesStore
                .getState()
                .setRuntimePaneTitle(options.workspaceTabId, options.paneTabId, normalized)
              applyTitleDerivedAgentStatus({
                workspaceTabId: options.workspaceTabId,
                paneTabId: options.paneTabId,
                rawTitle: raw,
                terminalAgent: options.terminalAgent
              })
            }
            options?.onTitleChange?.(normalized)
          },
          onAgentBecameIdle: (title, meta) => {
            if (meta?.staleWorkingTitleClear) {
              return
            }
            if (options?.workspaceTabId !== undefined && options.paneTabId) {
              applyTitleIdleTransition({
                workspaceTabId: options.workspaceTabId,
                paneTabId: options.paneTabId,
                title,
                terminalAgent: options.terminalAgent
              })
            }
          },
          onAgentExited: () => {
            if (options?.workspaceTabId !== undefined && options.paneTabId) {
              clearTitleDerivedOnAgentExit({
                workspaceTabId: options.workspaceTabId,
                paneTabId: options.paneTabId
              })
            }
          }
        })
      : null

  const writeOutput = (data: string, seq?: number) => {
    observeTerminalBracketedPasteModeOutput(term, data)
    titleObserver?.observePtyChunk(data)
    termLog(
      'pty:receive',
      'to-xterm',
      { bytes: reprTerminalBytes(data), length: data.length },
      terminalId
    )
    writeTerminalOutput(term, data, {
      foreground: true,
      ...(seq === undefined
        ? {}
        : { ackCredit: () => window.api.pty.acknowledgeOutput(terminalId, seq) })
    })
  }

  const syncPtySize = () => {
    ptyResize(terminalId, term.cols, term.rows).catch(console.error)
  }

  setPaneFitListener(internal, () => syncPtySize())

  void transport
    .connect({
      onData: writeOutput
    })
    .then((result) => {
      if (result.snapshot) {
        writeOutput(result.snapshot)
      }
      transport.activate()
      refitPaneTerminal(pane)
      syncPtySize()
    })
    .catch((err) => {
      console.error('[terminal] pty connect failed:', terminalId, err)
    })

  onDataDisposable = term.onData((data) => {
    if (data === '\x03') {
      markTerminalBracketedPasteInterrupted(term)
    }
    termLog(
      'xterm:onData',
      'to-pty',
      { bytes: reprTerminalBytes(data), length: data.length },
      terminalId
    )
    forwardXtermInputToPty(
      data,
      (payload) => transport.write(payload),
      (payload) => transport.writeQueryReply(payload)
    )
  })

  oscDisposable = term.parser.registerOscHandler(52, (data) => {
    const payload = data.slice(data.indexOf(';') + 1)
    if (payload === '?' || payload === '') return false
    try {
      writeClipboardText(atob(payload))
      return true
    } catch {
      return false
    }
  })

  return {
    transport,
    dispose: () => {
      titleObserver?.reset()
      setPaneFitListener(internal, null)
      transport.disconnect()
      onDataDisposable?.dispose()
      oscDisposable?.dispose()
    }
  }
}
