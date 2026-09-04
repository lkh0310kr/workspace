import { describe, expect, it } from "vitest";
import { shouldReloadModelPreview, withModelCacheBust } from "./modelPreviewWatch";

describe("shouldReloadModelPreview", () => {
  it("reloads on exact path match", () => {
    expect(shouldReloadModelPreview("models/box.stl", ["models/box.stl"])).toBe(true);
  });

  it("ignores unrelated files", () => {
    expect(shouldReloadModelPreview("models/box.stl", ["models/other.stl"])).toBe(false);
    expect(shouldReloadModelPreview("models/box.stl", ["README.md"])).toBe(false);
  });

  it("reloads same-stem siblings (obj/mtl)", () => {
    expect(shouldReloadModelPreview("parts/bracket.obj", ["parts/bracket.mtl"])).toBe(true);
  });

  it("reloads gltf package sidecars in the same folder", () => {
    expect(shouldReloadModelPreview("ship/hull.gltf", ["ship/geometry.bin"])).toBe(true);
    expect(shouldReloadModelPreview("ship/hull.gltf", ["ship/albedo.png"])).toBe(true);
  });

  it("does not treat sibling glb folders as packages", () => {
    expect(shouldReloadModelPreview("models/a.glb", ["models/b.glb"])).toBe(false);
  });

  it("reloads on blank/unknown churn", () => {
    expect(shouldReloadModelPreview("models/box.stl", [])).toBe(true);
    expect(shouldReloadModelPreview("models/box.stl", [""])).toBe(true);
  });

  it("normalizes separators", () => {
    expect(shouldReloadModelPreview("models/box.stl", ["models\\box.stl"])).toBe(true);
  });
});

describe("withModelCacheBust", () => {
  it("sets v query on custom-scheme urls", () => {
    const url = withModelCacheBust("workspace-model://local/tmp/box.glb", 7);
    expect(url).toContain("v=7");
    expect(url.startsWith("workspace-model://")).toBe(true);
  });

  it("replaces an existing v param", () => {
    const once = withModelCacheBust("workspace-model://local/a.glb?v=1", 2);
    expect(once).toContain("v=2");
    expect(once).not.toContain("v=1");
  });
});
