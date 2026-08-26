import { describe, expect, it } from "vitest";
import { isTerminalViewportAtBottom } from "./terminal-wheel-scroll";

describe("terminal-wheel-scroll", () => {
  it("isTerminalViewportAtBottom when viewportY >= baseY", () => {
    const terminal = {
      buffer: { active: { viewportY: 10, baseY: 10 } },
    } as Parameters<typeof isTerminalViewportAtBottom>[0];
    expect(isTerminalViewportAtBottom(terminal)).toBe(true);

    const scrolled = {
      buffer: { active: { viewportY: 5, baseY: 10 } },
    } as Parameters<typeof isTerminalViewportAtBottom>[0];
    expect(isTerminalViewportAtBottom(scrolled)).toBe(false);
  });
});
