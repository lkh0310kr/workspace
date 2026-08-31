import type { Terminal } from "@xterm/xterm";
import {
  clearSharedOptionKeyTracker,
  getSharedOptionKeyTracker,
} from "../lib/keyboard-layout/shared-option-key-tracker";
import { releaseTerminalImeTextareaAnchor } from "../lib/pane-manager/terminal-ime-candidate-anchor";
import { sendCapturedTerminalInput } from "./terminal-captured-input-dispatch";
import { pasteClipboardIntoTerminal } from "./terminal-clipboard-paste";
import {
  resolveTerminalShortcutAction,
  type TerminalShortcutAction,
} from "./terminal-shortcut-policy";
import {
  reprTerminalBytes,
  serializeKeyboardEvent,
  termLog,
} from "./terminalDebugLog";
import type { PtyTransport } from "./ptyTransport";

let optionModifierSyncInstalled = false;

function ensureOptionModifierSync(): void {
  if (optionModifierSyncInstalled) {
    return;
  }
  optionModifierSyncInstalled = true;
  window.api.terminal.onClearOptionModifiers(() => {
    clearSharedOptionKeyTracker();
  });
}

function getKittyKeyboardFlags(terminal: Terminal): number {
  const core = (terminal as unknown as { _core?: { coreService?: { kittyKeyboard?: { flags?: number } } } })
    ._core;
  return core?.coreService?.kittyKeyboard?.flags ?? 0;
}

function actionLabel(action: TerminalShortcutAction): string {
  if (action.type === "sendInput") {
    return reprTerminalBytes(action.data);
  }
  if (action.type === "paste") {
    return "paste";
  }
  return action.type;
}

/**
 * Orca routes terminal shortcuts on window keydown (capture) before xterm/kitty
 * encoders run. attachCustomKeyEventHandler alone is not enough for Option chords.
 */
export function installTerminalKeyHandler(args: {
  terminal: Terminal;
  transport: PtyTransport;
  terminalId: number;
  isFocused?: () => boolean;
}): () => void {
  const { terminal, transport, terminalId } = args;
  ensureOptionModifierSync();
  const optionKeyLocations = getSharedOptionKeyTracker();
  const isMac = navigator.userAgent.includes("Mac");

  const isForTerminal = (): boolean => {
    if (args.isFocused) {
      return args.isFocused();
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

  const resolveAction = (event: KeyboardEvent) =>
    resolveTerminalShortcutAction(
      {
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        isComposing: event.isComposing,
        altModifierActive: event.getModifierState("Alt"),
      },
      isMac,
      optionKeyLocations.get(),
      () => getKittyKeyboardFlags(terminal),
    );

  const onModifierDown = (event: KeyboardEvent): void => {
    optionKeyLocations.keyDown(event);
    if (event.key === "Alt") {
      termLog(
        "keyboard:modifier",
        "option-down",
        { location: event.location, held: optionKeyLocations.get() },
        terminalId,
      );
    }
  };

  const onModifierUp = (event: KeyboardEvent): void => {
    optionKeyLocations.keyUp(event);
    if (event.key === "Alt") {
      termLog(
        "keyboard:modifier",
        "option-up",
        { location: event.location, held: optionKeyLocations.get() },
        terminalId,
      );
    }
  };

  const onWindowBlur = (): void => {
    optionKeyLocations.clear();
  };

  const dispatchAction = (event: KeyboardEvent, action: TerminalShortcutAction): void => {
    switch (action.type) {
      case "sendInput": {
        releaseTerminalImeTextareaAnchor(terminal);
        const sent = sendCapturedTerminalInput({ transport, data: action.data });
        termLog(
          "keyboard:capture",
          "sendInput",
          {
            event: serializeKeyboardEvent(event),
            bytes: reprTerminalBytes(action.data),
            sent,
            kittyFlags: getKittyKeyboardFlags(terminal),
          },
          terminalId,
        );
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      case "scrollViewport":
        if (action.position === "top") {
          terminal.scrollToTop();
        } else {
          terminal.scrollToBottom();
        }
        termLog(
          "keyboard:capture",
          "scrollViewport",
          { position: action.position, event: serializeKeyboardEvent(event) },
          terminalId,
        );
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      case "selectAll":
        if (!event.repeat) {
          terminal.selectAll();
        }
        termLog(
          "keyboard:capture",
          "selectAll",
          { event: serializeKeyboardEvent(event) },
          terminalId,
        );
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      case "paste":
        void pasteClipboardIntoTerminal(terminal).then((pasted) => {
          termLog(
            "keyboard:capture",
            "paste",
            { event: serializeKeyboardEvent(event), pasted },
            terminalId,
          );
        });
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isForTerminal()) {
      return;
    }

    const altActive = event.altKey || event.getModifierState("Alt");
    const isNavigationKey =
      event.code === "ArrowLeft" ||
      event.code === "ArrowRight" ||
      event.code === "Backspace" ||
      event.code === "Delete";
    if (
      !altActive &&
      optionKeyLocations.get() > 0 &&
      !isNavigationKey &&
      event.code !== "AltLeft" &&
      event.code !== "AltRight"
    ) {
      optionKeyLocations.clear();
    }

    const action = resolveAction(event);
    termLog(
      "keyboard:capture",
      "keydown",
      {
        event: serializeKeyboardEvent(event),
        optionHeld: optionKeyLocations.get(),
        altModifierActive: event.getModifierState("Alt"),
        action: action ? actionLabel(action) : null,
        focused: isForTerminal(),
      },
      terminalId,
    );

    if (!action) {
      return;
    }

    dispatchAction(event, action);
  };

  window.addEventListener("keydown", onModifierDown, true);
  window.addEventListener("keyup", onModifierUp, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("blur", onWindowBlur);

  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown" || !isForTerminal()) {
      return true;
    }
    const action = resolveAction(event);
    const bypass = action !== null;
    termLog(
      "keyboard:xterm-bypass",
      bypass ? "block" : "pass",
      {
        event: serializeKeyboardEvent(event),
        action: action ? actionLabel(action) : null,
      },
      terminalId,
    );
    return !bypass;
  });

  return () => {
    window.removeEventListener("keydown", onModifierDown, true);
    window.removeEventListener("keyup", onModifierUp, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("blur", onWindowBlur);
    optionKeyLocations.clear();
    terminal.attachCustomKeyEventHandler(() => true);
  };
}
