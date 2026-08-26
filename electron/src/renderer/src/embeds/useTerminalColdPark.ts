import { useEffect, useState } from "react";

/** Unmount xterm after pane has been hidden this long (PtySession stays in main). */
export const TERMINAL_COLD_PARK_MS = 30_000;

/** Pure helper for tests — whether xterm should remain mounted after hidden duration. */
export function terminalShouldStayLive(
  visible: boolean,
  active: boolean,
  hiddenForMs: number,
): boolean {
  if (visible && active) return true;
  return hiddenForMs < TERMINAL_COLD_PARK_MS;
}

/**
 * Returns whether the terminal xterm instance should stay mounted.
 * Hidden/inactive panes cold-park after {@link TERMINAL_COLD_PARK_MS}.
 */
export function useTerminalColdPark(visible: boolean, active: boolean): boolean {
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (visible && active) {
      setLive(true);
      return;
    }
    const timer = window.setTimeout(() => setLive(false), TERMINAL_COLD_PARK_MS);
    return () => window.clearTimeout(timer);
  }, [visible, active]);

  return live;
}
