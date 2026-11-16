export type PtyDataEvent = { terminalId: number; seq: number; data: Uint8Array }
export type PtyDataSubscription = (listener: (event: PtyDataEvent) => void) => () => void

type PtyDataHandler = {
  onData: (data: string, seq: number) => void
  lastSeq: number
}

/** Buffers and orders streamed PTY output independently of the desktop IPC host. */
export function createPtyDataMultiplexer(
  subscribeToData: PtyDataSubscription,
  log: (terminalId: number, seq: number, text: string) => void
) {
  const handlersByTerminalId = new Map<number, PtyDataHandler>()
  const pendingByTerminalId = new Map<number, Array<{ seq: number; data: string }>>()
  const decoderByTerminalId = new Map<number, TextDecoder>()
  const seenSeqByTerminalId = new Map<number, number>()
  let unsubscribe: (() => void) | null = null

  function deliverTextToHandler(terminalId: number, seq: number, text: string): void {
    const entry = handlersByTerminalId.get(terminalId)
    if (!entry) {
      if (text.length === 0) return
      const pending = pendingByTerminalId.get(terminalId) ?? []
      pending.push({ seq, data: text })
      pendingByTerminalId.set(terminalId, pending)
      return
    }
    if (seq <= entry.lastSeq) return
    entry.lastSeq = seq
    if (text.length === 0) return
    log(terminalId, seq, text)
    entry.onData(text, seq)
  }

  function deliverToHandler({ terminalId, seq, data }: PtyDataEvent): void {
    if (seq <= (seenSeqByTerminalId.get(terminalId) ?? -1)) return
    seenSeqByTerminalId.set(terminalId, seq)
    let decoder = decoderByTerminalId.get(terminalId)
    if (!decoder) {
      decoder = new TextDecoder('utf-8')
      decoderByTerminalId.set(terminalId, decoder)
    }
    deliverTextToHandler(terminalId, seq, decoder.decode(data, { stream: true }))
  }

  function flushPending(terminalId: number): void {
    const pending = pendingByTerminalId.get(terminalId)
    if (!pending?.length) return
    pendingByTerminalId.delete(terminalId)
    pending.sort((a, b) => a.seq - b.seq)
    for (const chunk of pending) deliverTextToHandler(terminalId, chunk.seq, chunk.data)
  }

  function ensureSubscribed(): void {
    if (!unsubscribe) unsubscribe = subscribeToData(deliverToHandler)
  }

  return {
    reset(): void {
      unsubscribe?.()
      unsubscribe = null
      handlersByTerminalId.clear()
      pendingByTerminalId.clear()
      decoderByTerminalId.clear()
      seenSeqByTerminalId.clear()
    },
    bootstrap(): void {
      ensureSubscribed()
    },
    subscribe(
      terminalId: number,
      onData: (data: string, seq: number) => void,
      initialLastSeq: number
    ): () => void {
      handlersByTerminalId.set(terminalId, { onData, lastSeq: initialLastSeq })
      seenSeqByTerminalId.set(
        terminalId,
        Math.max(seenSeqByTerminalId.get(terminalId) ?? -1, initialLastSeq)
      )
      ensureSubscribed()
      flushPending(terminalId)
      return () => {
        handlersByTerminalId.delete(terminalId)
        pendingByTerminalId.delete(terminalId)
        if (handlersByTerminalId.size === 0 && unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
      }
    },
    setLastSeq(terminalId: number, lastSeq: number): void {
      const entry = handlersByTerminalId.get(terminalId)
      if (entry) {
        entry.lastSeq = lastSeq
        flushPending(terminalId)
      }
    }
  }
}
