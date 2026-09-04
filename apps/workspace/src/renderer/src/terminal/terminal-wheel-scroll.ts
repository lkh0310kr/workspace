import type { Terminal } from "@xterm/xterm";

/** True when the viewport is pinned to the live output (not reading scrollback). */
export function isTerminalViewportAtBottom(terminal: Terminal): boolean {
  const buf = terminal.buffer.active;
  return buf.viewportY >= buf.baseY;
}

const wheelRemainderByTerminal = new WeakMap<Terminal, number>();

export function terminalCellHeightPx(terminal: Terminal): number {
  const el = terminal.element;
  if (!el || terminal.rows < 1) return 17;
  const viewport = el.querySelector(".xterm-viewport");
  const viewportHeight =
    viewport && "clientHeight" in viewport
      ? Number((viewport as HTMLElement).clientHeight)
      : 0;
  const height = viewportHeight > 0 ? viewportHeight : el.clientHeight;
  return Math.max(1, height / terminal.rows);
}

/** True when xterm scrollback has lines above the live screen. */
export function terminalHasViewportScrollback(terminal: Terminal): boolean {
  const buf = terminal.buffer.active;
  return buf.type === "normal" && buf.length > terminal.rows;
}

/** Pixel wheel deltas → fractional line scroll (smooth trackpad feel). */
export function wheelDeltaToLines(terminal: Terminal, event: WheelEvent): number {
  const sensitivity = event.shiftKey
    ? (terminal.options.fastScrollSensitivity ?? 5)
    : (terminal.options.scrollSensitivity ?? 1);
  const cellHeight = terminalCellHeightPx(terminal);

  let deltaPx = event.deltaY;
  if (event.deltaMode === 1) {
    deltaPx *= cellHeight;
  } else if (event.deltaMode === 2) {
    deltaPx *= cellHeight * terminal.rows;
  }

  const prev = wheelRemainderByTerminal.get(terminal) ?? 0;
  const next = prev + (deltaPx / cellHeight) * sensitivity;
  const lines = next > 0 ? Math.floor(next) : Math.ceil(next);
  wheelRemainderByTerminal.set(terminal, next - lines);
  return lines;
}

type TerminalWheelModes = Pick<Terminal, "buffer" | "modes" | "rows" | "scrollLines">;

/**
 * Whether the capture-phase wheel handler should let xterm / Orca's TUI multiplier
 * see the event. Returning false means we consume the wheel locally.
 */
export function shouldForwardTerminalWheelEvent(
  terminal: TerminalWheelModes,
  event: Pick<WheelEvent, "deltaY">,
): boolean {
  if (event.deltaY === 0) return false;

  const buf = terminal.buffer.active;
  const mouseReporting = terminal.modes.mouseTrackingMode !== "none";

  // Fullscreen TUIs: Orca wheel multiplier when mouse reporting is active.
  if (buf.type === "alternate" && mouseReporting) {
    return true;
  }

  // Never let xterm forward wheel to the PTY as shell arrow keys.
  return false;
}

/**
 * Drive xterm viewport scroll from wheel on the normal buffer. Uses Orca-patched
 * scrollLines (pixel smooth scroll via ScrollableElement).
 */
export function applyTerminalWheelScroll(terminal: Terminal, event: WheelEvent): boolean {
  if (!shouldForwardTerminalWheelEvent(terminal, event)) {
    if (terminal.buffer.active.type === "normal") {
      const lines = wheelDeltaToLines(terminal, event);
      if (lines !== 0) {
        terminal.scrollLines(lines);
      }
    }
    return false;
  }
  return true;
}

export function installTerminalWheelScroll(terminal: Terminal): () => void {
  const root = terminal.element;
  if (!root) return () => {};

  wheelRemainderByTerminal.delete(terminal);

  // Capture-phase: WebGL canvas is the wheel target; xterm's bubble handler +
  // attachCustomWheelEventHandler(return false) blocked Orca viewport scroll.
  const onWheel = (event: WheelEvent) => {
    const forward = applyTerminalWheelScroll(terminal, event);
    if (!forward) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  root.addEventListener("wheel", onWheel, { capture: true, passive: false });

  return () => {
    root.removeEventListener("wheel", onWheel, { capture: true });
    wheelRemainderByTerminal.delete(terminal);
  };
}
