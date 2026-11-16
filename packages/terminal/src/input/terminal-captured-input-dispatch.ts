export type TerminalInputTransport = {
  write(data: string): void
}

export function sendCapturedTerminalInput(args: {
  transport: TerminalInputTransport | undefined
  data: string
}): boolean {
  const { transport, data } = args
  if (!transport) {
    return false
  }
  transport.write(data)
  return true
}
