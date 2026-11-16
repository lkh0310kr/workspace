import { useBrowserReloadShortcutBootstrap, useBrowserRuntimeBootstrap } from '../../adapters/browser'
import {
  useTerminalAgentStatusBootstrap,
  useTerminalInputBootstrap
} from '../../adapters/terminal'
import { useEditorShortcutBootstrap } from '../editor'
import { useDiagnosticsBootstrap } from '../diagnostics'

/** Compose feature-owned runtime bootstrap hooks in their established order. */
export function useAppBootstrap(): void {
  useDiagnosticsBootstrap()
  useBrowserRuntimeBootstrap()
  useTerminalAgentStatusBootstrap()
  useBrowserReloadShortcutBootstrap()
  useEditorShortcutBootstrap()
  useTerminalInputBootstrap()
}
