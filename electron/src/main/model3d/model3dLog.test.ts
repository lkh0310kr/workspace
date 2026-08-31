import { describe, expect, it } from "vitest";
import { getModel3dLogPath } from "./model3dLog";

describe("model3dLog", () => {
  it("uses app support logs directory", () => {
    expect(getModel3dLogPath()).toContain("model3d.ndjson");
    expect(getModel3dLogPath()).toContain("logs");
  });
});
