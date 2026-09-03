import { describe, expect, it } from "vitest";
import { classifyMediaExtension } from "./mediaKind";

describe("classifyMediaExtension", () => {
  it("classifies images", () => {
    expect(classifyMediaExtension("a/b.png")).toBe("image");
    expect(classifyMediaExtension("a/b.JPEG")).toBe("image");
  });

  it("classifies pdf", () => {
    expect(classifyMediaExtension("a/b.pdf")).toBe("pdf");
  });

  it("classifies video", () => {
    expect(classifyMediaExtension("a/b.mp4")).toBe("video");
    expect(classifyMediaExtension("a/b.MKV")).toBe("video");
  });

  it("classifies audio", () => {
    expect(classifyMediaExtension("a/b.mp3")).toBe("audio");
    expect(classifyMediaExtension("a/b.flac")).toBe("audio");
  });

  it("classifies epub", () => {
    expect(classifyMediaExtension("a/b.epub")).toBe("epub");
  });

  it("classifies model3d", () => {
    expect(classifyMediaExtension("a/b.glb")).toBe("model3d");
    expect(classifyMediaExtension("a/b.fbx")).toBe("model3d");
    expect(classifyMediaExtension("a/b.obj")).toBe("model3d");
  });

  it("classifies the hardware simulator marker", () => {
    expect(classifyMediaExtension("lab/hardware-sim.json")).toBe("hardware-sim");
    expect(classifyMediaExtension("lab/other.json")).toBe("other");
  });

  it("falls back to other", () => {
    expect(classifyMediaExtension("a/b.txt")).toBe("other");
  });
});
