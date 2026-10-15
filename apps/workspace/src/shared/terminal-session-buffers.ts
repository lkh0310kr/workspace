/** Max UTF-8 bytes per terminal snapshot written on app quit (orca session cap subset). */
export const TERMINAL_SESSION_BUFFER_BYTE_LIMIT = 512 * 1024;

export type TerminalSessionBuffersFile = {
  buffersByTerminalId: Record<string, string>;
};

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Keep the tail that fits the byte budget without splitting UTF-8 code points. */
export function trimTerminalSessionBufferToByteLimit(
  serialized: string,
  maxBytes = TERMINAL_SESSION_BUFFER_BYTE_LIMIT,
): string {
  const bytes = new TextEncoder().encode(serialized);
  if (bytes.length <= maxBytes) {
    return serialized;
  }
  let tail = bytes.subarray(bytes.length - maxBytes);
  // Drop leading continuation bytes so the tail starts on a character boundary.
  while (tail.length > 0 && (tail[0] & 0xc0) === 0x80) {
    tail = tail.subarray(1);
  }
  return new TextDecoder().decode(tail);
}
