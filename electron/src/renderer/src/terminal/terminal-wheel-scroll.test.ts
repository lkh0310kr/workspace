import { describe, expect, it, vi } from "vitest";
import {
  handleTerminalWheelEvent,
  isTerminalViewportAtBottom,
  shouldForwardWheelToPty,
} from "./terminal-wheel-scroll";

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

  it("forwards wheel to PTY on alternate buffer (tmux)", () => {
    const terminal = {
      buffer: { active: { type: "alternate" as const, viewportY: 0, baseY: 0 } },
    } as Parameters<typeof shouldForwardWheelToPty>[0];
    expect(shouldForwardWheelToPty(terminal)).toBe(true);
    expect(
      handleTerminalWheelEvent(terminal, { deltaY: 10 } as WheelEvent),
    ).toBe(true);
  });

  it("scrolls xterm viewport on normal buffer without forwarding", () => {
    const scrollLines = vi.fn();
    const terminal = {
      buffer: { active: { type: "normal" as const, viewportY: 10, baseY: 10 } },
      options: { scrollSensitivity: 1, fastScrollSensitivity: 5 },
      scrollLines,
    } as unknown as Parameters<typeof handleTerminalWheelEvent>[0];
    expect(shouldForwardWheelToPty(terminal)).toBe(false);
    expect(
      handleTerminalWheelEvent(terminal, { deltaY: 53, shiftKey: false } as WheelEvent),
    ).toBe(false);
    expect(scrollLines).toHaveBeenCalledWith(-1);
  });
});
