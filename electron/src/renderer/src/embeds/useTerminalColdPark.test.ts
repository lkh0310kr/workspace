import { describe, expect, it } from "vitest";
import { TERMINAL_COLD_PARK_MS, terminalShouldStayLive } from "./useTerminalColdPark";

describe("useTerminalColdPark", () => {
  it("stays live while visible and active", () => {
    expect(terminalShouldStayLive(true, true, TERMINAL_COLD_PARK_MS + 1)).toBe(true);
  });

  it("cold-parks after hidden threshold", () => {
    expect(terminalShouldStayLive(false, true, TERMINAL_COLD_PARK_MS)).toBe(false);
    expect(terminalShouldStayLive(false, true, TERMINAL_COLD_PARK_MS - 1)).toBe(true);
  });

  it("wakes when visible again", () => {
    expect(terminalShouldStayLive(true, true, 0)).toBe(true);
  });
});
