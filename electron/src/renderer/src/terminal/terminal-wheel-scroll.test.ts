import { describe, expect, it, vi } from "vitest";
import {
  applyTerminalWheelScroll,
  isTerminalViewportAtBottom,
  shouldXtermOwnWheelScroll,
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

  it("scrolls viewport on primary buffer", () => {
    const scrollLines = vi.fn();
    const terminal = {
      rows: 24,
      buffer: { active: { type: "normal" as const, length: 100, viewportY: 50, baseY: 76 } },
      options: { scrollSensitivity: 1, fastScrollSensitivity: 5 },
      scrollLines,
    } as unknown as Parameters<typeof applyTerminalWheelScroll>[0];
    const consumed = applyTerminalWheelScroll(terminal, {
      deltaY: 53,
      deltaMode: 0,
      shiftKey: false,
    } as WheelEvent);
    expect(consumed).toBe(true);
    expect(scrollLines).toHaveBeenCalledWith(1);
  });

  it("delegates wheel to tmux on alternate buffer", () => {
    const scrollLines = vi.fn();
    const terminal = {
      rows: 24,
      buffer: { active: { type: "alternate" as const, length: 24 } },
      options: { scrollSensitivity: 1, fastScrollSensitivity: 5 },
      scrollLines,
    } as unknown as Parameters<typeof applyTerminalWheelScroll>[0];
    expect(shouldXtermOwnWheelScroll(terminal)).toBe(false);
    const consumed = applyTerminalWheelScroll(terminal, {
      deltaY: 53,
      deltaMode: 0,
      shiftKey: false,
    } as WheelEvent);
    expect(consumed).toBe(false);
    expect(scrollLines).not.toHaveBeenCalled();
  });
});
