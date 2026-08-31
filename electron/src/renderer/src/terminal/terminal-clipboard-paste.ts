import type { Terminal } from "@xterm/xterm";
import { readClipboardText } from "../electron";

/** Paste system clipboard into xterm (bracketed paste handled by xterm). */
export async function pasteClipboardIntoTerminal(terminal: Terminal): Promise<boolean> {
  const text = await readClipboardText().catch(() => "");
  if (!text) {
    return false;
  }
  terminal.paste(text);
  return true;
}
