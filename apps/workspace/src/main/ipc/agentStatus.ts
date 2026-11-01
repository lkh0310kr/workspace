import { ipcMain } from 'electron'
import { registerTerminalAgentPaneKey, unregisterTerminalAgentPaneKey } from '../workspaceAgentHookServer'

export function registerAgentStatusIpc(): void {
  ipcMain.on('agentStatus:register-terminal-pane', (_event, payload: { terminalId: number; paneKey: string }) => {
    if (typeof payload?.terminalId === 'number' && typeof payload?.paneKey === 'string') {
      registerTerminalAgentPaneKey(payload.terminalId, payload.paneKey)
    }
  })
  ipcMain.on('agentStatus:unregister-terminal-pane', (_event, terminalId: number) => {
    if (typeof terminalId === 'number') unregisterTerminalAgentPaneKey(terminalId)
  })
}
