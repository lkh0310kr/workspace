import { createPtyDataMultiplexer } from '@workspace/terminal/transport/ptyDataMultiplexer'
import { reprTerminalBytes, termLog } from './terminalDebugLog'

const multiplexer = createPtyDataMultiplexer(
  (listener) =>
    window.api.pty.onData((id, seq, data) => {
      const terminalId = typeof id === 'number' ? id : Number(id)
      if (Number.isFinite(terminalId)) listener({ terminalId, seq, data })
    }),
  (terminalId, seq, text) =>
    termLog('pty:ipc', 'onData', { bytes: reprTerminalBytes(text), length: text.length, seq }, terminalId)
)

/** Test-only reset — vitest shares module state across cases. */
export const __resetPtyDataMultiplexerForTests = (): void => multiplexer.reset()

/** Register the global pty:data listener before any terminal pane mounts. */
export const bootstrapPtyDataMultiplexer = (): void => multiplexer.bootstrap()

export const subscribePtyData = multiplexer.subscribe
export const setPtyDataLastSeq = multiplexer.setLastSeq
