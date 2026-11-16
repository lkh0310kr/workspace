import type { Terminal } from '@xterm/xterm'
import {
  pasteTerminalClipboard,
  pasteTerminalText,
  resolveTerminalMultilinePasteOptions
} from '@workspace/terminal'
import type { TuiAgent } from '@workspace/terminal/agent'
import {
  readClipboardText,
  saveClipboardImageAsTempFile
} from '../../../features/app-shell/nativeClipboard'

export type { TerminalClipboardPasteResult } from '@workspace/terminal'

export type PasteClipboardIntoTerminalArgs = {
  terminal: Terminal
  terminalAgent?: TuiAgent | null
}

export async function pasteClipboardIntoTerminal({
  terminal,
  terminalAgent
}: PasteClipboardIntoTerminalArgs): Promise<boolean> {
  const multilinePasteOptions = resolveTerminalMultilinePasteOptions(terminalAgent)
  const result = await pasteTerminalClipboard({
    readClipboardText,
    saveClipboardImageAsTempFile,
    multilinePasteOptions,
    pasteText: (text, options) => pasteTerminalText(terminal, text, options)
  })
  return result.status === 'pasted'
}
