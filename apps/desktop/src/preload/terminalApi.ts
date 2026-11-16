import { ipcRenderer } from 'electron'

export const terminalApi = {
  terminal: {
    setFocused: (id: number | null): void => ipcRenderer.send('terminal:set-focused', id),
    onClearOptionModifiers: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('terminal:clear-option-modifiers', listener)
      return () => ipcRenderer.removeListener('terminal:clear-option-modifiers', listener)
    },
    onCaptureSessionBuffers: (cb: (terminalIds: number[]) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, terminalIds: number[]): void =>
        cb(terminalIds)
      ipcRenderer.on('terminal:capture-session-buffers', listener)
      return () => ipcRenderer.removeListener('terminal:capture-session-buffers', listener)
    },
    sendSessionBuffers: (payload: { buffersByTerminalId: Record<string, string> }): void =>
      ipcRenderer.send('terminal:session-buffers', payload),
    onOscTitle: (
      cb: (payload: { terminalId: number; rawTitle: string; normalizedTitle: string }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { terminalId: number; rawTitle: string; normalizedTitle: string }
      ): void => cb(payload)
      ipcRenderer.on('terminal:osc-title', listener)
      return () => ipcRenderer.removeListener('terminal:osc-title', listener)
    },
    onPtySpawned: (cb: (payload: { terminalId: number }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { terminalId: number }): void =>
        cb(payload)
      ipcRenderer.on('terminal:pty-spawned', listener)
      return () => ipcRenderer.removeListener('terminal:pty-spawned', listener)
    }
  },
  agentStatus: {
    onSet: (
      cb: (data: import('../shared/agent-status-ipc').AgentStatusIpcPayload) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: import('../shared/agent-status-ipc').AgentStatusIpcPayload
      ): void => cb(data)
      ipcRenderer.on('agentStatus:set', listener)
      return () => ipcRenderer.removeListener('agentStatus:set', listener)
    },
    onClear: (
      cb: (data: import('../shared/agent-status-ipc').AgentStatusClearIpcPayload) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: import('../shared/agent-status-ipc').AgentStatusClearIpcPayload
      ): void => cb(data)
      ipcRenderer.on('agentStatus:clear', listener)
      return () => ipcRenderer.removeListener('agentStatus:clear', listener)
    },
    registerTerminalPane: (terminalId: number, paneKey: string): void => {
      ipcRenderer.send('agentStatus:register-terminal-pane', { terminalId, paneKey })
    },
    unregisterTerminalPane: (terminalId: number): void => {
      ipcRenderer.send('agentStatus:unregister-terminal-pane', { terminalId })
    }
  },
  pty: {
    spawn: (cols: number, rows: number, tabId?: number): Promise<number> =>
      ipcRenderer.invoke('pty:spawn', cols, rows, tabId),
    connect: (
      id: number
    ): Promise<{
      id: number
      snapshot: string
      snapshotCols: number
      snapshotRows: number
      lastSeq: number
      isReattach: boolean
    }> => ipcRenderer.invoke('pty:connect', id),
    disconnect: (id: number): void => ipcRenderer.send('pty:disconnect', id),
    acknowledgeOutput: (id: number, seq: number): void =>
      ipcRenderer.send('pty:ack-output', id, seq),
    write: (id: number, data: Uint8Array): void => ipcRenderer.send('pty:write', id, data),
    resize: (id: number, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    dispose: (id: number): void => ipcRenderer.send('pty:dispose', id),
    onData: (cb: (id: number, seq: number, data: Uint8Array) => void): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { id: number; seq: number; data: Uint8Array }
      ): void => cb(payload.id, payload.seq, payload.data)
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    }
  }
}
