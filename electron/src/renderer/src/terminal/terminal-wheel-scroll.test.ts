import { describe, expect, it, vi } from "vitest";
import {
  applyTerminalWheelScroll,
  isTerminalViewportAtBottom,
  terminalHasViewportScrollback,
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

  it("detects scrollback on normal buffer with history", () => {
    const terminal = {
      rows: 24,
      buffer: { active: { type: "normal" as const, length: 100 } },
    } as Parameters<typeof terminalHasViewportScrollback>[0];
    expect(terminalHasViewportScrollback(terminal)).toBe(true);
  });

  it("accumulates fractional wheel deltas across events", () => {
    const terminal = {
      rows: 24,
      element: {
        querySelector: () => ({ clientHeight: 24 * 17 }),
      },
      options: { scrollSensitivity: 1, fastScrollSensitivity: 5 },
    } as unknown as Parameters<typeof wheelDeltaToLines>[0];
    expect(
      wheelDeltaToLines(terminal, {
        deltaY: 5,
        deltaMode: 0,
        shiftKey: false,
      } as WheelEvent),
    ).toBe(0);
    expect(
      wheelDeltaToLines(terminal, {
        deltaY: 5,
        deltaMode: 0,
        shiftKey: false,
      } as WheelEvent),
    ).toBe(0);
    expect(
      wheelDeltaToLines(terminal, {
        deltaY: 7,
        deltaMode: 0,
        shiftKey: false,
      } as WheelEvent),
    ).toBe(1);
  });

  it("scrolls viewport without forwarding when scrollback exists", () => {
    const scrollLines = vi.fn();
    const terminal = {
      rows: 24,
      element: {
        querySelector: () => ({ clientHeight: 24 * 17 }),
      },
      buffer: { active: { type: "normal" as const, length: 100 } },
      options: { scrollSensitivity: 1, fastScrollSensitivity: 5 },
      scrollLines,
    } as unknown as Parameters<typeof applyTerminalWheelScroll>[0];
    expect(
      applyTerminalWheelScroll(terminal, {
        deltaY: 17,
        deltaMode: 0,
        shiftKey: false,
      } as WheelEvent),
    ).toBe(false);
    expect(scrollLines).toHaveBeenCalledWith(-1);
  });

  it("forwards wheel when there is no scrollback to scroll", () => {
    const scrollLines = vi.fn();
    const terminal = {
      rows: 24,
      buffer: { active: { type: "alternate" as const, length: 24 } },
      options: { scrollSensitivity: 1, fastScrollSensitivity: 5 },
      scrollLines,
    } as unknown as Parameters<typeof applyTerminalWheelScroll>[0];
    expect(
      applyTerminalWheelScroll(terminal, {
        deltaY: 17,
        deltaMode: 0,
        shiftKey: false,
      } as WheelEvent),
    ).toBe(true);
    expect(scrollLines).not.toHaveBeenCalled();
  });
});
