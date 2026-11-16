export { TerminalPane } from '@workspace/terminal'
export type { TerminalPaneHost } from '@workspace/terminal'
export { desktopTerminalPaneHost } from './terminalPaneHost'
export {
  agentPaneKey,
  getFreshHookAgentStatus,
  useAgentStatusStore
} from './state/agentStatusStore'
export { useRuntimeTerminalTitlesStore } from './state/runtimeTerminalTitlesStore'
