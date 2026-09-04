import { describe, expect, it, afterEach } from "vitest";
import { findWebExportPresetName, resolveGodotBinary, resetGodotBinaryCacheForTests } from "./godotExport";

describe("findWebExportPresetName", () => {
  it("finds the real godot-demo fixture's Web preset", () => {
    const name = findWebExportPresetName("test-fixtures/godot-demo");
    expect(name).toBe("Web");
  });

  it("returns null when export_presets.cfg doesn't exist", () => {
    expect(findWebExportPresetName("test-fixtures/does-not-exist")).toBeNull();
  });
});

describe("resolveGodotBinary", () => {
  const previous = process.env.WORKSPACE_GODOT_PATH;

  afterEach(() => {
    if (previous === undefined) delete process.env.WORKSPACE_GODOT_PATH;
    else process.env.WORKSPACE_GODOT_PATH = previous;
    resetGodotBinaryCacheForTests();
  });

  it("respects WORKSPACE_GODOT_PATH", () => {
    resetGodotBinaryCacheForTests();
    process.env.WORKSPACE_GODOT_PATH = "/bin/sh";
    expect(resolveGodotBinary()).toBe("/bin/sh");
  });
});
