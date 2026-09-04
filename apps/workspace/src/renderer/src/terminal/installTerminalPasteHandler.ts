import type { Terminal } from "@xterm/xterm";
import type { TuiAgent } from "../../../shared/agent/tui-agent";
import { pasteClipboardIntoTerminal } from "./terminal-clipboard-paste";

let suppressNextNativePaste = false;
let pasteSuppressionTimerId: number | null = null;

export function notifyTerminalKeyboardPasteHandled(): void {
  suppressNextNativePaste = true;
  if (pasteSuppressionTimerId !== null) {
    window.clearTimeout(pasteSuppressionTimerId);
  }
  pasteSuppressionTimerId = window.setTimeout(() => {
    pasteSuppressionTimerId = null;
    suppressNextNativePaste = false;
  }, 0);
}

function shouldSuppressNativePasteChord(event: KeyboardEvent, isMac: boolean): boolean {
  const key = event.key.toLowerCase();
  if (isMac) {
    return key === "v" && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  }
  return (
    (key === "v" && event.ctrlKey && !event.metaKey && !event.altKey) ||
    (event.key === "Insert" && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey)
  );
}

/**
 * Intercept native paste on xterm's textarea. Image-only clipboards do not fire
 * useful paste text, and Chromium's clipboard pipeline can race with IPC reads.
 */
export function installTerminalPasteHandler(args: {
  terminal: Terminal;
  container: HTMLElement;
  getTerminalAgent?: () => TuiAgent | null | undefined;
  isFocused?: () => boolean;
}): () => void {
  const { terminal, container } = args;
  const isMac = navigator.userAgent.includes("Mac");
  const textarea = terminal.textarea;
  if (!textarea) {
    return () => {};
  }

  const isForTerminal = (): boolean => {
    if (args.isFocused) {
      return args.isFocused();
    }
    const root = terminal.element;
    if (!root) {
      return false;
    }
    const active = document.activeElement;
    return active === textarea || (!!active && active instanceof Node && root.contains(active));
  };

  const onPaste = (event: ClipboardEvent): void => {
    if (!isForTerminal()) {
      return;
    }
    if (suppressNextNativePaste) {
      suppressNextNativePaste = false;
      if (pasteSuppressionTimerId !== null) {
        window.clearTimeout(pasteSuppressionTimerId);
        pasteSuppressionTimerId = null;
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void pasteClipboardIntoTerminal({
      terminal,
      terminalAgent: args.getTerminalAgent?.() ?? null,
    });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isForTerminal() || !shouldSuppressNativePasteChord(event, isMac) || !event.defaultPrevented) {
      return;
    }
    notifyTerminalKeyboardPasteHandled();
  };

  textarea.addEventListener("paste", onPaste);
  container.addEventListener("paste", onPaste);
  window.addEventListener("keydown", onKeyDown, true);

  return () => {
    textarea.removeEventListener("paste", onPaste);
    container.removeEventListener("paste", onPaste);
    window.removeEventListener("keydown", onKeyDown, true);
    if (pasteSuppressionTimerId !== null) {
      window.clearTimeout(pasteSuppressionTimerId);
      pasteSuppressionTimerId = null;
    }
    suppressNextNativePaste = false;
  };
}
