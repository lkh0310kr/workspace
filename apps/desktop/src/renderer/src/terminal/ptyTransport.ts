import { createPtyInputWriteQueue } from './ptyInputWriteQueue'
import { subscribePtyData } from './ptyDataMultiplexer'
import { reprTerminalBytes, termLog } from './terminalDebugLog'

export interface PtyConnectResult {
  id: number
  snapshot: string
  snapshotCols: number
  snapshotRows: number
  lastSeq: number
  isReattach: boolean
}

type DataHandler = (data: string, seq: number) => void

export interface PtyTransport {
  connect(callbacks: {
    onData: DataHandler
    onWriteUnavailable?: () => void
  }): Promise<PtyConnectResult>
  /** Start delivering live output after the initial snapshot has been written to xterm. */
  activate(): void
  disconnect(): void
  write(data: string): void
  writeQueryReply(data: string): void
}

export function createElectronPtyTransport(terminalId: number): PtyTransport {
  let connected = false
  let destroyed = false
  let outputActive = false
  let bufferedOutput: Array<{ data: string; seq: number }> = []
  let onLiveData: DataHandler | null = null
  let dataUnlisten: (() => void) | null = null

  const inputQueue = createPtyInputWriteQueue({
    isWritable: () => connected && !destroyed,
    write: (_id, data) => {
      const bytes = new TextEncoder().encode(data)
      termLog(
        'pty:write',
        'ipc-send',
        { bytes: reprTerminalBytes(data), length: data.length, connected },
        terminalId
      )
      window.api.pty.write(terminalId, bytes)
    }
  })

  return {
    async connect(callbacks) {
      if (destroyed) throw new Error('transport destroyed')
      onLiveData = callbacks.onData
      dataUnlisten?.()
      const result = await window.api.pty.connect(terminalId)
      // The global multiplexer buffers bytes while connect is in flight. Attach
      // at the snapshot sequence to discard anything the snapshot already has,
      // and hold newer output until connectPanePty has written that snapshot.
      dataUnlisten = subscribePtyData(
        terminalId,
        (data, seq) => {
          if (outputActive) callbacks.onData(data, seq)
          else bufferedOutput.push({ data, seq })
        },
        result.lastSeq
      )
      connected = true
      termLog('pty:connect', 'connected', { lastSeq: result.lastSeq }, terminalId)

      return result
    },

    activate() {
      if (outputActive) return
      outputActive = true
      const pending = bufferedOutput
      bufferedOutput = []
      for (const item of pending) onLiveData?.(item.data, item.seq)
    },

    disconnect() {
      if (!connected) return
      connected = false
      outputActive = false
      bufferedOutput = []
      onLiveData = null
      termLog('pty:connect', 'disconnected', {}, terminalId)
      dataUnlisten?.()
      dataUnlisten = null
      window.api.pty.disconnect(terminalId)
      inputQueue.clear()
    },

    write(data: string) {
      termLog(
        'pty:transport',
        'enqueue',
        { bytes: reprTerminalBytes(data), length: data.length, connected },
        terminalId
      )
      inputQueue.enqueue(String(terminalId), data)
    },

    writeQueryReply(data: string) {
      termLog(
        'pty:transport',
        'query-reply-immediate',
        { bytes: reprTerminalBytes(data), length: data.length, connected },
        terminalId
      )
      inputQueue.enqueueQueryReply(String(terminalId), data)
    }
  }
}
