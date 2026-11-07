import { describe, expect, it, vi } from "vitest";
import { pasteTerminalClipboard } from "./terminal-clipboard-paste";
import {
  markTerminalBracketedPasteInterrupted,
  pasteTerminalText,
} from "./terminal-bracketed-paste";

describe("terminal clipboard paste", () => {
  it("forces bracketed paste for generated image-only clipboard paths", async () => {
    const pasteText = vi.fn();

    await pasteTerminalClipboard({
      readClipboardText: vi.fn().mockResolvedValue(""),
      saveClipboardImageAsTempFile: vi
        .fn()
        .mockResolvedValue("/tmp/workspace-paste-1760000000000-id.png"),
      pasteText,
    });

    expect(pasteText).toHaveBeenCalledWith("/tmp/workspace-paste-1760000000000-id.png", {
      forceBracketedPaste: true,
    });
  });

  it("forces generated image paste onto the native bracketed-paste path after Ctrl+C", async () => {
    const terminal = {
      modes: { bracketedPasteMode: true },
      options: { ignoreBracketedPasteMode: false },
      input: vi.fn(),
      paste: vi.fn(),
    };
    markTerminalBracketedPasteInterrupted(terminal);

    await pasteTerminalClipboard({
      readClipboardText: vi.fn().mockResolvedValue(""),
      saveClipboardImageAsTempFile: vi
        .fn()
        .mockResolvedValue("/tmp/workspace-paste-1760000000000-id.png"),
      pasteText: (text, options) => pasteTerminalText(terminal, text, options),
    });

    expect(terminal.input).toHaveBeenCalledWith(
      "\x1b[200~/tmp/workspace-paste-1760000000000-id.png\x1b[201~",
    );
    expect(terminal.paste).not.toHaveBeenCalled();
  });

  it("bracket-pastes multiline text when configured", async () => {
    const terminal = {
      modes: { bracketedPasteMode: false },
      options: { ignoreBracketedPasteMode: false },
      input: vi.fn(),
      paste: vi.fn(),
    };

    await pasteTerminalClipboard({
      readClipboardText: vi.fn().mockResolvedValue("line one\nline two"),
      saveClipboardImageAsTempFile: vi.fn(),
      multilinePasteOptions: { forceBracketedPasteForMultiline: true },
      pasteText: (text, options) => pasteTerminalText(terminal, text, options),
    });

    expect(terminal.input).toHaveBeenCalledWith("\x1b[200~line one\rline two\x1b[201~");
    expect(terminal.paste).not.toHaveBeenCalled();
  });

  it("returns empty when clipboard has no text or image", async () => {
    const result = await pasteTerminalClipboard({
      readClipboardText: vi.fn().mockResolvedValue(""),
      saveClipboardImageAsTempFile: vi.fn().mockResolvedValue(null),
      pasteText: vi.fn(),
    });

    expect(result).toEqual({ status: "skipped", reason: "empty" });
  });
});
