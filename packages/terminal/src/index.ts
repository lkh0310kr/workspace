export { TerminalSearch } from './TerminalSearch'
export type { SearchAddonPort, TerminalSearchDecorations } from './TerminalSearch'
export { safeFind } from './safeFind'
export type { TerminalPaneHost, TerminalPtyTransport } from './TerminalPaneHost'
export {
  XTERM_THEMES,
  TERMINAL_SCROLLBACK_ROWS,
  getTerminalSearchDecorations
} from './terminalThemes'
export type { ResolvedTheme } from './terminalThemes'
export { focusTerminalTextarea } from './focusTerminalTextarea'
export { TerminalPane } from './TerminalPane'

export {
  BRACKETED_PASTE_START,
  BRACKETED_PASTE_END,
  encodeWindowsInputRecordPasteText,
  markTerminalBracketedPasteInterrupted,
  normalizeTerminalPasteLineEndings,
  observeTerminalBracketedPasteModeOutput,
  pasteTerminalText,
  sanitizeBracketedPasteText,
  sanitizeTerminalPasteText,
  wrapTerminalBracketedPasteText
} from './terminal-bracketed-paste'
export type {
  PasteTerminalTextOptions,
  WindowsInputRecordNewline
} from './terminal-bracketed-paste'
export { resolveTerminalMultilinePasteOptions } from './terminal-paste-options'
export {
  formatDroppedPaths,
  installTerminalFileDropHandler,
  TERMINAL_FILE_DROP_EVENT
} from './terminal-file-drop'
export { resolveTerminalShortcutAction } from './terminal-shortcut-policy'
export type { TerminalShortcutAction, TerminalShortcutEvent } from './terminal-shortcut-policy'
export {
  isAppOwnedCopyChord,
  shouldBypassXtermClipboardKeyboardEvent
} from './xterm-clipboard-bypass-policy'
export type {
  XtermClipboardBypassEvent,
  XtermClipboardBypassOptions
} from './xterm-clipboard-bypass-policy'
