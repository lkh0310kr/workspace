import { describe, expect, it, vi } from "vitest";
import {
  applyTerminalWheelScroll,
  isTerminalViewportAtBottom,
  wheelDeltaToLines,
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

  it("maps wheel delta to whole lines", () => {
    const terminal = {
      rows: 24,
      options: { scrollSensitivity: 1, fastScrollSensitivity: 5 },
    } as Parameters<typeof wheelDeltaToLines>[0];
    expect(
      wheelDeltaToLines(terminal, { deltaY: 53, deltaMode: 0, shiftKey: false } as WheelEvent),
    ).toBe(1);
    expect(
      wheelDeltaToLines(terminal, { deltaY: -53, deltaMode: 0, shiftKey: false } as WheelEvent),
    ).toBe(-1);
    expect(
      wheelDeltaToLines(terminal, { deltaY: 3, deltaMode: 0, shiftKey: false } as WheelEvent),
    ).toBe(1);
  });

  it("scrolls viewport and never forwards to PTY", () => {
    const scrollLines = vi.fn();
    const terminal = {
      rows: 24,
      options: { scrollSensitivity: 1, fastScrollSensitivity: 5 },
      scrollLines,
    } as unknown as Parameters<typeof applyTerminalWheelScroll>[0];
    applyTerminalWheelScroll(terminal, {
      deltaY: 53,
      deltaMode: 0,
      shiftKey: false,
    } as WheelEvent);
    expect(scrollLines).toHaveBeenCalledWith(-1);
  });

  it("still consumes wheel when buffer has no scrollback yet", () => {
    const scrollLines = vi.fn();
    const terminal = {
      rows: 24,
      buffer: { active: { type: "alternate" as const, length: 24 } },
      options: { scrollSensitivity: 1, fastScrollSensitivity: 5 },
      scrollLines,
    } as unknown as Parameters<typeof applyTerminalWheelScroll>[0];
    applyTerminalWheelScroll(terminal, {
      deltaY: 53,
      deltaMode: 0,
      shiftKey: false,
    } as WheelEvent);
    expect(scrollLines).toHaveBeenCalledWith(-1);
  });
});
