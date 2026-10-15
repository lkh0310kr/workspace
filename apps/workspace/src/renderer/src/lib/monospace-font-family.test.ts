import { describe, expect, it } from "vitest";
import { buildTerminalFontFamily } from "./monospace-font-family";

describe("buildTerminalFontFamily", () => {
  it("includes bundled nerd symbol font and CJK mono fallbacks", () => {
    const family = buildTerminalFontFamily();
    expect(family).toContain("Workspace Nerd Font Symbols");
    expect(family).toContain("Noto Sans Mono CJK KR");
  });
});
