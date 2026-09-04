import type { OptionKeyLocationState } from "../lib/keyboard-layout/option-key-location-state";

export type TerminalShortcutEvent = {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  /** macOS: altKey can be false on chord keys while Option is still physically held. */
  altModifierActive?: boolean;
};

export type TerminalShortcutAction =
  | { type: "sendInput"; data: string }
  | { type: "scrollViewport"; position: "top" | "bottom" }
  | { type: "selectAll" }
  | { type: "paste" };

function isOptionNavigationCode(code?: string): boolean {
  return (
    code === "ArrowLeft" ||
    code === "ArrowRight" ||
    code === "Backspace" ||
    code === "Delete"
  );
}

/**
 * Orca terminal-shortcut-policy (macOS subset).
 * Window capture runs before xterm/kitty encoders; Option+arrow uses \\eb/\\ef
 * because readline does not bind xterm's CSI 1;3D/C sequences.
 */
export function resolveTerminalShortcutAction(
  event: TerminalShortcutEvent,
  isMac: boolean,
  optionKeyLocations: OptionKeyLocationState = 0,
  getKittyKeyboardFlags: () => number = () => 0,
): TerminalShortcutAction | null {
  if (event.isComposing) {
    return null;
  }

  // Cmd+A (macOS) selects all scrollback. On Windows/Linux Ctrl+A must stay
  // readline "beginning of line" (\x01) — use Ctrl+Shift+A for select-all.
  if (
    !event.altKey &&
    event.key.toLowerCase() === "a" &&
    ((isMac && event.metaKey && !event.ctrlKey && !event.shiftKey) ||
      (!isMac && event.ctrlKey && !event.metaKey && event.shiftKey))
  ) {
    return { type: "selectAll" };
  }

  if (
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "v" &&
    ((isMac && event.metaKey && !event.ctrlKey) ||
      (!isMac && event.ctrlKey && !event.metaKey))
  ) {
    return { type: "paste" };
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

  if (isMac && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
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

  const altActive = event.altKey || event.altModifierActive === true;
  const navigationCode = isOptionNavigationCode(event.code);
  // Stale tracker after main-process Option+Backspace can leave held=1 while Alt is up;
  // only trust it for navigation keys, not letters (KeyD must not become \x1bd).
  const optionHeld = altActive || (optionKeyLocations > 0 && navigationCode);

  if (!event.metaKey && !event.ctrlKey && optionHeld && !event.shiftKey) {
    if (event.code === "Backspace") {
      if (getKittyKeyboardFlags() > 0) {
        return null;
      }
      // ^W (backward-kill-word): zsh/readline reliably binds this; \x1b\x7f only
      // deleted single chars in practice (see terminal.ndjson main:pty:read \x08\x08).
      return { type: "sendInput", data: "\x17" };
    }
    if (event.code === "Delete") {
      return { type: "sendInput", data: "\x1bd" };
    }
    if (event.code?.startsWith("Numpad") !== true) {
      if (event.code === "ArrowLeft") {
        if (getKittyKeyboardFlags() > 0) {
          return null;
        }
        return { type: "sendInput", data: "\x1bb" };
      }
      if (event.code === "ArrowRight") {
        if (getKittyKeyboardFlags() > 0) {
          return null;
        }
        return { type: "sendInput", data: "\x1bf" };
      }
    }
    if (!altActive) {
      return null;
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
