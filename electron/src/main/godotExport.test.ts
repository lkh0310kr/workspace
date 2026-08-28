import { describe, expect, it } from "vitest";
import { findWebExportPresetName } from "./godotExport";

describe("findWebExportPresetName", () => {
  it("finds the real godot-demo fixture's Web preset", () => {
    const name = findWebExportPresetName("test-fixtures/godot-demo");
    expect(name).toBe("Web");
  });

  it("returns null when export_presets.cfg doesn't exist", () => {
    expect(findWebExportPresetName("test-fixtures/does-not-exist")).toBeNull();
  });
});
