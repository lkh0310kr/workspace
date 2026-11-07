import type { TuiAgent } from '../../../shared/agent/tui-agent'

export type TerminalAgentPaneBinding = {
  workspaceTabId: number
  paneTabId: string
  terminalAgent?: TuiAgent
}

const bindingsByTerminalId = new Map<number, TerminalAgentPaneBinding>()

export function registerTerminalAgentPane(
  terminalId: number,
  binding: TerminalAgentPaneBinding,
): void {
  bindingsByTerminalId.set(terminalId, binding)
}

export function unregisterTerminalAgentPane(terminalId: number): void {
  bindingsByTerminalId.delete(terminalId)
}

export function getTerminalAgentPaneBinding(
  terminalId: number,
): TerminalAgentPaneBinding | undefined {
  return bindingsByTerminalId.get(terminalId)
}

export function allTerminalAgentPaneBindings(): Iterable<[number, TerminalAgentPaneBinding]> {
  return bindingsByTerminalId.entries()
}
