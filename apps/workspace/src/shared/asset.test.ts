import { describe, it, expect } from "vitest";
import { classifyAssetType, assetBaseName } from "./asset";

describe("classifyAssetType", () => {
  it("classifies known image/video/audio/pdf/ebook/markdown/model3d extensions", () => {
    expect(classifyAssetType("a.png")).toBe("image");
    expect(classifyAssetType("a.mp4")).toBe("video");
    expect(classifyAssetType("a.mp3")).toBe("audio");
    expect(classifyAssetType("a.pdf")).toBe("pdf");
    expect(classifyAssetType("a.epub")).toBe("ebook");
    expect(classifyAssetType("a.md")).toBe("markdown");
    expect(classifyAssetType("a.glb")).toBe("model3d");
    expect(classifyAssetType("a.fbx")).toBe("model3d");
  });

  it("is case-insensitive", () => {
    expect(classifyAssetType("A.PNG")).toBe("image");
  });

  it("works on a full path, not just a bare filename", () => {
    expect(classifyAssetType("/Users/kh/proj/photo.jpg")).toBe("image");
  });

  it("classifies the Hardware-as-Code project marker", () => {
    expect(classifyAssetType("lab/hardware-sim.json")).toBe("hardware-sim");
    expect(classifyAssetType("lab/HARDWARE-SIM.JSON")).toBe("hardware-sim");
    expect(classifyAssetType("lab/other.json")).toBe("unknown");
  });

  it("returns unknown for an unrecognized extension", () => {
    expect(classifyAssetType("a.ts")).toBe("unknown");
    expect(classifyAssetType("a.rs")).toBe("unknown");
  });

  it("returns unknown for a file with no extension", () => {
    expect(classifyAssetType("Makefile")).toBe("unknown");
  });

  it("does not misclassify a dotfile (leading dot, no real extension) as having an extension", () => {
    expect(classifyAssetType(".gitignore")).toBe("unknown");
  });
});

describe("assetBaseName", () => {
  it("returns the last path segment", () => {
    expect(assetBaseName("/a/b/c.png")).toBe("c.png");
  });

  it("returns the input unchanged when there's no slash", () => {
    expect(assetBaseName("c.png")).toBe("c.png");
  });
});
