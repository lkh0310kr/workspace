import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./wslPaths", () => ({
  isWsl: vi.fn(() => true),
  readWindowsWorkingArea: vi.fn(() => ({ x: 0, y: 0, width: 1536, height: 816 })),
}));

import {
  applyWslWorkAreaBounds,
  isWslWorkAreaMaximized,
  toggleWslWindowMaximize,
} from "./wslWindow";

function mockWindow(bounds: { x: number; y: number; width: number; height: number } = {
  x: 100,
  y: 100,
  width: 900,
  height: 600,
}) {
  let current = { ...bounds };
  return {
    isDestroyed: () => false,
    getBounds: () => ({ ...current }),
    setBounds: vi.fn((next: typeof current) => {
      current = { ...next };
    }),
  } as unknown as import("electron").BrowserWindow;
}

describe("wslWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies Windows working area on maximize", () => {
    const win = mockWindow();
    expect(applyWslWorkAreaBounds(win)).toBe(true);
    expect(win.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 1536, height: 816 });
    expect(isWslWorkAreaMaximized(win)).toBe(true);
  });

  it("toggles between work area and restored bounds", () => {
    const win = mockWindow();
    applyWslWorkAreaBounds(win);
    toggleWslWindowMaximize(win);
    expect(isWslWorkAreaMaximized(win)).toBe(false);
    expect(win.setBounds).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
    toggleWslWindowMaximize(win);
    expect(isWslWorkAreaMaximized(win)).toBe(true);
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1536, height: 816 });
  });
});
