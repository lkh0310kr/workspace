/** macOS Option chords handled in main (renderer misses modifier on arrows). */
const MAC_OPTION_TERMINAL_BYTES: Readonly<Record<string, string>> = {
  ArrowLeft: "\x1bb",
  ArrowRight: "\x1bf",
};

export function resolveMacOptionTerminalBytes(code: string): string | null {
  return MAC_OPTION_TERMINAL_BYTES[code] ?? null;
}
