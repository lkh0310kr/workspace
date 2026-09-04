import { describe, expect, it } from "vitest";
import { resolveTerminalMultilinePasteOptions } from "./terminal-paste-options";

describe("resolveTerminalMultilinePasteOptions", () => {
  it("enables multiline bracketed paste on macOS", () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    });
    expect(resolveTerminalMultilinePasteOptions()).toEqual({
      forceBracketedPasteForMultiline: true,
    });
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: original,
    });
  });

  it("enables multiline bracketed paste for detected TUI agents", () => {
    expect(resolveTerminalMultilinePasteOptions("claude")).toEqual({
      forceBracketedPasteForMultiline: true,
    });
  });
});
