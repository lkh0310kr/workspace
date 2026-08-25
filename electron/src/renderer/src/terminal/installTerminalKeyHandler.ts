import type { Terminal } from "@xterm/xterm";
import { createOptionKeyLocationTracker } from "../lib/keyboard-layout/option-key-location-state";
import { releaseTerminalImeTextareaAnchor } from "../lib/pane-manager/terminal-ime-candidate-anchor";
import { resolveTerminalMacShortcutAction } from "./terminal-mac-shortcut-policy";

/**
 * Orca routes terminal shortcuts on window keydown (capture) before xterm/kitty
 * encoders run. attachCustomKeyEventHandler alone is not enough for Option chords.
 */
export function installTerminalKeyHandler(args: {
  terminal: Terminal;
  sendInput: (data: string) => void;
  hasFocus?: () => boolean;
}): () => void {
  const { terminal } = args;
  const optionKeyLocations = createOptionKeyLocationTracker();

  const isForTerminal = (): boolean => {
    if (args.hasFocus && !args.hasFocus()) {
      return false;
    }
    const root = terminal.element;
    if (!root) {
      return false;
    }
    const active = document.activeElement;
    if (active instanceof Node && root.contains(active)) {
      return true;
    }
    return active === terminal.textarea;
  };

  const onModifierDown = (event: KeyboardEvent): void => {
    optionKeyLocations.keyDown(event);
  };
  const onModifierUp = (event: KeyboardEvent): void => {
    optionKeyLocations.keyUp(event);
  };
  const onWindowBlur = (): void => {
    optionKeyLocations.clear();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isForTerminal()) {
      return;
    }

    const action = resolveTerminalMacShortcutAction(event);
    if (!action) {
      return;
    }

    switch (action.type) {
      case "sendInput":
        releaseTerminalImeTextareaAnchor(terminal);
        args.sendInput(action.data);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      case "scrollViewport":
        if (action.position === "top") {
          terminal.scrollToTop();
        } else {
          terminal.scrollToBottom();
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      case "selectAll":
        if (!event.repeat) {
          terminal.selectAll();
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
    }
  };

  window.addEventListener("keydown", onModifierDown, true);
  window.addEventListener("keyup", onModifierUp, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("blur", onWindowBlur);

  // Block xterm kitty encoder from swallowing chords the window handler already sent.
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown" || !isForTerminal()) {
      return true;
    }
    const action = resolveTerminalMacShortcutAction(event);
    if (!action) {
      return true;
    }
    return false;
  });

  return () => {
    window.removeEventListener("keydown", onModifierDown, true);
    window.removeEventListener("keyup", onModifierUp, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("blur", onWindowBlur);
    optionKeyLocations.clear();
  };
}
