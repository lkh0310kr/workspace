/**
 * Suppresses the terminal emulator's own query reply when a cooked PTY echoes
 * that reply back as output. Readline commonly turns ESC ] into BEL and drops
 * ST, leaving the OSC payload visible at the prompt.
 */
type EchoProjection = { needle: string; holdPartial: boolean }
type ExpectedEcho = { projections: EchoProjection[]; remainingBytes: number }
const ECHO_SEARCH_BUDGET_BYTES = 256 * 1024

// eslint-disable-next-line no-control-regex -- this grammar recognizes a terminal ESC sequence.
const PRIVATE_DSR_RE = new RegExp('^\\u001b\\[\\?[0-9][0-9;]*n$')

function caretEncodeControls(reply: string): string {
  let result = ''
  for (const char of reply) {
    const code = char.charCodeAt(0)
    if (code === 9 || code === 10 || code === 13) result += char
    else if (code < 32) result += `^${String.fromCharCode(code + 64)}`
    else if (code === 127) result += '^?'
    else result += char
  }
  return result
}

function projections(reply: string, platform: NodeJS.Platform): EchoProjection[] {
  if (platform === 'win32') {
    return [{ needle: reply.replaceAll('\x1b', ''), holdPartial: true }]
  }
  const readline = reply.includes('\x1b]')
    ? reply.replaceAll('\x1b]', '\x07').replaceAll('\x1b\\', '')
    : PRIVATE_DSR_RE.test(reply)
      ? `\x07${reply.slice(3)}`
      : null
  return [
    { needle: caretEncodeControls(reply), holdPartial: true },
    ...(readline && readline.length >= 4 ? [{ needle: readline, holdPartial: true }] : []),
    { needle: reply, holdPartial: false }
  ]
}

/** Tracks only replies actually written to this PTY; unrelated shell output is preserved. */
export class TerminalQueryReplyEchoFilter {
  private expected: ExpectedEcho[] = []
  private pending = ''

  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  expect(reply: string): void {
    if (!reply) return
    this.expected.push({
      projections: projections(reply, this.platform),
      remainingBytes: ECHO_SEARCH_BUDGET_BYTES
    })
    if (this.expected.length > 64) this.expected.shift()
  }

  filter(data: string): string {
    if (!data) return ''
    if (this.expected.length === 0) {
      const output = this.pending + data
      this.pending = ''
      return output
    }
    let input = this.pending + data
    this.pending = ''
    let output = ''
    while (input.length > 0 && this.expected.length > 0) {
      let complete: { start: number; length: number; index: number } | null = null
      let partial = -1
      for (let index = 0; index < this.expected.length; index += 1) {
        for (const projection of this.expected[index]!.projections) {
          const at = input.indexOf(projection.needle)
          if (at !== -1 && (!complete || at < complete.start)) {
            complete = { start: at, length: projection.needle.length, index }
          }
          if (!projection.holdPartial) continue
          for (
            let offset = Math.max(0, input.length - projection.needle.length + 1);
            offset < input.length;
            offset += 1
          ) {
            if (projection.needle.startsWith(input.slice(offset))) {
              if (partial === -1 || offset < partial) partial = offset
              break
            }
          }
        }
      }
      if (complete && (partial === -1 || complete.start <= partial)) {
        output += input.slice(0, complete.start)
        input = input.slice(complete.start + complete.length)
        this.expected.splice(complete.index, 1)
        continue
      }
      if (partial !== -1) {
        output += input.slice(0, partial)
        this.pending = input.slice(partial)
        return this.finish(output, data.length)
      }
      output += input
      return this.finish(output, data.length)
    }
    return this.finish(output + input, data.length)
  }

  private finish(output: string, bytes: number): string {
    for (const expected of this.expected) expected.remainingBytes -= bytes
    this.expected = this.expected.filter((expected) => expected.remainingBytes > 0)
    if (this.expected.length === 0 && this.pending) {
      output += this.pending
      this.pending = ''
    }
    return output
  }
}
