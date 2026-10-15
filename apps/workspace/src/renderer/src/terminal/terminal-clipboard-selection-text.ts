// Ported from ref-proj/orca/src/renderer/src/components/terminal-pane/terminal-clipboard-selection-text.ts
import type { Terminal } from "@xterm/xterm";
import { stripTerminalSelectionGutter } from "../../../shared/terminal-selection-gutter";

/** Selection text for clipboard writes (screen cells minus agent CLI left gutter). */
export function readTerminalClipboardSelection(terminal: Pick<Terminal, "getSelection">): string {
  const selection = terminal.getSelection();
  return stripTerminalSelectionGutter(selection);
}
