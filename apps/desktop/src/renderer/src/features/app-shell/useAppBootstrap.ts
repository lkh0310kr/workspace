import { useBrowserReloadShortcutBootstrap, useBrowserRuntimeBootstrap } from '../browser/host'
import {
  useTerminalAgentStatusBootstrap,
  useTerminalInputBootstrap
} from '../terminal/host'
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
