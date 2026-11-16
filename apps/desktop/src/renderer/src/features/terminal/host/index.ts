export { desktopTerminalPaneHost } from './terminalPaneHost'
export type { TerminalPaneHost } from './terminalPaneHost'
export { useTerminalAgentStatusBootstrap } from './useTerminalAgentStatusBootstrap'
export { useTerminalInputBootstrap } from './useTerminalInputBootstrap'
export {
  bootstrapPtyDataMultiplexer,
  captureTerminalSessionBuffers,
  installTerminalAgentStatusBridge,
  notifyTerminalKeyboardPasteHandled,
  pasteClipboardIntoTerminal,
  syncAgentPaneRegistryFromLayouts
} from './runtime'
