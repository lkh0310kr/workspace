import type { Terminal } from "@xterm/xterm";
import { readClipboardText, saveClipboardImageAsTempFile } from "../electron";
import {
  pasteTerminalText,
  type PasteTerminalTextOptions,
} from "./terminal-bracketed-paste";
import { resolveTerminalMultilinePasteOptions } from "./terminal-paste-options";

type PasteTerminalClipboardDeps = {
  readClipboardText: () => Promise<string>;
  saveClipboardImageAsTempFile: () => Promise<string | null>;
  pasteText: (text: string, options?: PasteTerminalTextOptions) => boolean | void | Promise<boolean | void>;
  multilinePasteOptions?: PasteTerminalTextOptions;
  onTextPasteError?: (error: unknown) => void;
  onImagePasteError?: (error: unknown) => void;
};

export type TerminalClipboardPasteResult =
  | { status: "pasted"; kind: "image-path" | "text" }
  | {
      status: "skipped";
      reason:
        | "empty"
        | "image-paste-failed"
        | "image-paste-rejected"
        | "text-paste-failed"
        | "text-paste-rejected";
    };

export async function pasteTerminalClipboard({
  readClipboardText: readText,
  saveClipboardImageAsTempFile: saveImage,
  pasteText,
  multilinePasteOptions,
  onTextPasteError,
  onImagePasteError,
}: PasteTerminalClipboardDeps): Promise<TerminalClipboardPasteResult> {
  let text = "";
  try {
    text = await readText();
  } catch (error) {
    onTextPasteError?.(error);
    // Why: image-only clipboards can fail text reads; still try the image path.
  }

  if (text) {
    try {
      const result = await pasteText(text, multilinePasteOptions);
      if (result === false) {
        return { status: "skipped", reason: "text-paste-rejected" };
      }
      return { status: "pasted", kind: "text" };
    } catch (error) {
      onTextPasteError?.(error);
      return { status: "skipped", reason: "text-paste-failed" };
    }
  }

  try {
    const filePath = await saveImage();
    if (!filePath) {
      return { status: "skipped", reason: "empty" };
    }
    const result = await pasteText(filePath, { forceBracketedPaste: true });
    if (result === false) {
      return { status: "skipped", reason: "image-paste-rejected" };
    }
    return { status: "pasted", kind: "image-path" };
  } catch (error) {
    onImagePasteError?.(error);
    return { status: "skipped", reason: "image-paste-failed" };
  }
}

export type PasteClipboardIntoTerminalArgs = {
  terminal: Terminal;
  terminalAgent?: import("../../../shared/agent/tui-agent").TuiAgent | null;
};

export async function pasteClipboardIntoTerminal({
  terminal,
  terminalAgent,
}: PasteClipboardIntoTerminalArgs): Promise<boolean> {
  const multilinePasteOptions = resolveTerminalMultilinePasteOptions(terminalAgent);
  const result = await pasteTerminalClipboard({
    readClipboardText,
    saveClipboardImageAsTempFile,
    multilinePasteOptions,
    pasteText: (text, options) => {
      pasteTerminalText(terminal, text, options);
    },
  });
  return result.status === "pasted";
}
