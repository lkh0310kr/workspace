export { TerminalSearch, safeFind } from './search'
export type { SearchAddonPort, TerminalSearchDecorations } from './search'
export type { TerminalPaneHost, TerminalPtyTransport, ResolvedTheme } from './pane'
export {
  XTERM_THEMES,
  TERMINAL_SCROLLBACK_ROWS,
  getTerminalSearchDecorations,
  focusTerminalTextarea,
  TerminalPane,
  createTerminalPaneKind
} from './pane'
export {
  clearSharedOptionKeyTracker,
  getSharedOptionKeyTracker
} from './keyboard/shared-option-key-tracker'
export {
  agentPaneKey,
  getFreshHookAgentStatus,
  agentStatusStore
} from './state/agentStatusStore'
export { runtimeTerminalTitlesStore } from './state/runtimeTerminalTitlesStore'
export { AgentIcon, AGENT_CATALOG, getAgentLabel } from './agent/ui/agent-catalog'
export type { AgentCatalogEntry } from './agent/ui/agent-catalog'
export {
  sendCapturedTerminalInput,
  copyTerminalSelection,
  BRACKETED_PASTE_START,
  BRACKETED_PASTE_END,
  encodeWindowsInputRecordPasteText,
  markTerminalBracketedPasteInterrupted,
  normalizeTerminalPasteLineEndings,
  observeTerminalBracketedPasteModeOutput,
  pasteTerminalText,
  sanitizeBracketedPasteText,
  sanitizeTerminalPasteText,
  wrapTerminalBracketedPasteText,
  resolveTerminalMultilinePasteOptions,
  pasteTerminalClipboard,
  formatDroppedPaths,
  installTerminalFileDropHandler,
  TERMINAL_FILE_DROP_EVENT,
  resolveTerminalShortcutAction,
  isAppOwnedCopyChord,
  shouldBypassXtermClipboardKeyboardEvent
} from './input'
export type {
  PasteTerminalTextOptions,
  WindowsInputRecordNewline,
  PasteTerminalClipboardDeps,
  TerminalClipboardPasteResult,
  TerminalShortcutAction,
  TerminalShortcutEvent,
  XtermClipboardBypassEvent,
  XtermClipboardBypassOptions
} from './input'
