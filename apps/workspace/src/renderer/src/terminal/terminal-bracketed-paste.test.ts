import { describe, expect, it, vi } from "vitest";
import {
  markTerminalBracketedPasteInterrupted,
  observeTerminalBracketedPasteModeOutput,
  pasteTerminalText,
  sanitizeTerminalPasteText,
} from "./terminal-bracketed-paste";

function createTerminal(bracketedPasteMode = true) {
  const terminal = {
    modes: {
      bracketedPasteMode,
    },
    options: {
      ignoreBracketedPasteMode: false as boolean | undefined,
    },
    input: vi.fn(),
    paste: vi.fn(),
  };
  return terminal;
}

describe("terminal bracketed paste policy", () => {
  it("temporarily ignores bracketed paste wrappers for single-line paste after Ctrl+C", () => {
    const terminal = createTerminal(true);
    const observedIgnoreValues: (boolean | undefined)[] = [];
    terminal.paste.mockImplementation(() => {
      observedIgnoreValues.push(terminal.options.ignoreBracketedPasteMode);
    });

    markTerminalBracketedPasteInterrupted(terminal);
    pasteTerminalText(terminal, "a69ce28e1d092e0c8825cd1a109ac36409962bc1");

    expect(terminal.paste).toHaveBeenCalledWith("a69ce28e1d092e0c8825cd1a109ac36409962bc1");
    expect(observedIgnoreValues).toEqual([true]);
    expect(terminal.options.ignoreBracketedPasteMode).toBe(false);
  });

  it("forces bracketed paste for multiline text when requested", () => {
    const terminal = createTerminal(false);

    pasteTerminalText(terminal, "one\ntwo", {
      forceBracketedPasteForMultiline: true,
    });

    expect(terminal.input).toHaveBeenCalledWith("\x1b[200~one\rtwo\x1b[201~");
    expect(terminal.paste).not.toHaveBeenCalled();
  });

  it("forces bracketed paste behavior when requested after Ctrl+C", () => {
    const terminal = createTerminal(true);

    markTerminalBracketedPasteInterrupted(terminal);
    pasteTerminalText(terminal, "/tmp/workspace-paste-image.png", {
      forceBracketedPaste: true,
    });

    expect(terminal.input).toHaveBeenCalledWith(
      "\x1b[200~/tmp/workspace-paste-image.png\x1b[201~",
    );
    expect(terminal.paste).not.toHaveBeenCalled();
  });

  it("clears the interrupted state when live output refreshes bracketed paste mode", () => {
    const terminal = createTerminal(true);
    const observedIgnoreValues: (boolean | undefined)[] = [];
    terminal.paste.mockImplementation(() => {
      observedIgnoreValues.push(terminal.options.ignoreBracketedPasteMode);
    });

    markTerminalBracketedPasteInterrupted(terminal);
    observeTerminalBracketedPasteModeOutput(terminal, "\x1b[?25;2004h");
    pasteTerminalText(terminal, "commit");

    expect(observedIgnoreValues).toEqual([false]);
  });

  it("sanitizes escape-heavy paste text without split arrays", () => {
    const text = Array.from({ length: 512 }, (_value, index) => `part-${index}\x1b[201~`).join("");
    const splitSpy = vi.spyOn(String.prototype, "split");

    const sanitized = sanitizeTerminalPasteText(text);
    const splitCallCount = splitSpy.mock.calls.length;
    splitSpy.mockRestore();

    expect(sanitized).not.toContain("\x1b");
    expect(sanitized).toContain("\u241b[201~");
    expect(splitCallCount).toBe(0);
  });
});
