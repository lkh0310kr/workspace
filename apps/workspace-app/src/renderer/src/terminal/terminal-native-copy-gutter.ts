// Ported from ref-proj/orca/src/renderer/src/components/terminal-pane/terminal-native-copy-gutter.ts
import type { IDisposable, Terminal } from "@xterm/xterm";
import { readTerminalClipboardSelection } from "./terminal-clipboard-selection-text";

type NativeCopyTerminal = Pick<Terminal, "getSelection" | "hasSelection"> & {
  element?: HTMLElement;
};

/**
 * xterm's DOM `copy` listener writes raw screen cells. Capture phase wins over
 * xterm's element listener so agent gutter columns are not copied (#19770).
 */
export function installTerminalNativeCopyGutterTrim(terminal: NativeCopyTerminal): IDisposable {
  const element = terminal.element;
  if (!element) {
    return { dispose: () => {} };
  }
  const onCopy = (event: ClipboardEvent): void => {
    if (!terminal.hasSelection() || !event.clipboardData) {
      return;
    }
    event.clipboardData.setData("text/plain", readTerminalClipboardSelection(terminal));
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  element.addEventListener("copy", onCopy, { capture: true });
  return { dispose: () => element.removeEventListener("copy", onCopy, { capture: true }) };
}
