import { describe, expect, it } from "vitest";
import { probeWebGL } from "./webglProbe";

describe("probeWebGL", () => {
  it("returns a structured result in jsdom", () => {
    const result = probeWebGL();
    expect(typeof result.ok).toBe("boolean");
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});
