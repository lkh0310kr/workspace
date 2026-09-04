import { describe, expect, it, vi } from "vitest";
import {
  applyTerminalWheelScroll,
  isTerminalViewportAtBottom,
  shouldForwardTerminalWheelEvent,
  terminalHasViewportScrollback,
  wheelDeltaToLines,
} from "./terminal-wheel-scroll";

function terminalStub(overrides: Record<string, unknown> = {}) {
  return {
    rows: 24,
    element: {
      querySelector: () => ({ clientHeight: 24 * 17 }),
    },
    buffer: { active: { type: "normal" as const, length: 100, viewportY: 10, baseY: 10 } },
    modes: { mouseTrackingMode: "none" as const },
    options: { scrollSensitivity: 1, fastScrollSensitivity: 5 },
    scrollLines: vi.fn(),
    ...overrides,
  };
}

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

  it("forwards wheel only for alternate-buffer mouse reporting", () => {
    const normal = terminalStub();
    expect(
      shouldForwardTerminalWheelEvent(normal as never, { deltaY: 17 } as WheelEvent),
    ).toBe(false);

    const alternate = terminalStub({
      buffer: { active: { type: "alternate" as const, length: 24 } },
      modes: { mouseTrackingMode: "active" as const },
    });
    expect(
      shouldForwardTerminalWheelEvent(alternate as never, { deltaY: 17 } as WheelEvent),
    ).toBe(true);
  });

  it("never forwards wheel at the shell prompt on the normal buffer", () => {
    const scrollLines = vi.fn();
    const terminal = terminalStub({
      buffer: { active: { type: "normal" as const, length: 24, viewportY: 0, baseY: 0 } },
      scrollLines,
    });
    expect(
      applyTerminalWheelScroll(terminal as never, {
        deltaY: 17,
        deltaMode: 0,
        shiftKey: false,
      } as WheelEvent),
    ).toBe(false);
  });

  it("scrolls viewport without forwarding when scrollback exists", () => {
    const scrollLines = vi.fn();
    const terminal = terminalStub({ scrollLines });
    expect(
      applyTerminalWheelScroll(terminal as never, {
        deltaY: 17,
        deltaMode: 0,
        shiftKey: false,
      } as WheelEvent),
    ).toBe(false);
    expect(scrollLines).toHaveBeenCalledWith(1);
  });

  it("forwards wheel when alternate buffer has mouse reporting", () => {
    const scrollLines = vi.fn();
    const terminal = terminalStub({
      buffer: { active: { type: "alternate" as const, length: 24 } },
      modes: { mouseTrackingMode: "active" as const },
      scrollLines,
    });
    expect(
      applyTerminalWheelScroll(terminal as never, {
        deltaY: 17,
        deltaMode: 0,
        shiftKey: false,
      } as WheelEvent),
    ).toBe(true);
    expect(scrollLines).not.toHaveBeenCalled();
  });
});
