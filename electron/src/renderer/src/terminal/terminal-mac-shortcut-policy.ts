export type TerminalShortcutAction =
  | { type: "sendInput"; data: string }
  | { type: "scrollViewport"; position: "top" | "bottom" }
  | { type: "selectAll" };

type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "isComposing"
>;

/**
 * Orca terminal-shortcut-policy byte fallbacks (macOS word-kill / word-nav).
 * Match physical keys via `code` — Option on macOS often changes `key` to a composed glyph.
 */
export function resolveTerminalMacShortcutAction(event: ShortcutEvent): TerminalShortcutAction | null {
  if (event.isComposing) {
    return null;
  }

  if (
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "a"
  ) {
    return { type: "selectAll" };
  }

  if (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.code === "Backspace"
  ) {
    return { type: "sendInput", data: "\x17" };
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
    if (event.code === "Backspace") {
      return { type: "sendInput", data: "\x15" };
    }
    if (event.code === "Delete") {
      return { type: "sendInput", data: "\x0b" };
    }
    if (event.code === "ArrowLeft") {
      return { type: "sendInput", data: "\x01" };
    }
    if (event.code === "ArrowRight") {
      return { type: "sendInput", data: "\x05" };
    }
    if (event.code === "ArrowUp") {
      return { type: "scrollViewport", position: "top" };
    }
    if (event.code === "ArrowDown") {
      return { type: "scrollViewport", position: "bottom" };
    }
  }

  if (!event.metaKey && !event.ctrlKey && event.altKey && !event.shiftKey) {
    if (event.code === "Backspace") {
      return { type: "sendInput", data: "\x1b\x7f" };
    }
    if (event.code === "Delete") {
      return { type: "sendInput", data: "\x1bd" };
    }
    if (event.code?.startsWith("Numpad") !== true) {
      if (event.code === "ArrowLeft") {
        return { type: "sendInput", data: "\x1bb" };
      }
      if (event.code === "ArrowRight") {
        return { type: "sendInput", data: "\x1bf" };
      }
    }
    if (event.code === "KeyB") {
      return { type: "sendInput", data: "\x1bb" };
    }
    if (event.code === "KeyF") {
      return { type: "sendInput", data: "\x1bf" };
    }
    if (event.code === "KeyD") {
      return { type: "sendInput", data: "\x1bd" };
    }
  }

  return null;
}
