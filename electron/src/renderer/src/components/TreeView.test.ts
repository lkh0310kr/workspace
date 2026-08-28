import { describe, it, expect } from "vitest";
import { classifyFile } from "./TreeView";

// Regression check for the shared/asset.ts extraction — classifyFile
// used to inline this extension list directly; confirms every extension
// it originally covered still routes to the exact same pane kind.
describe("classifyFile", () => {
  it("routes markdown extensions to markdown", () => {
    expect(classifyFile("a.md")).toBe("markdown");
    expect(classifyFile("a.markdown")).toBe("markdown");
  });

  it("routes every originally-covered viewer extension to viewer", () => {
    const viewerExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".pdf",
      ".mp4",
      ".webm",
      ".mov",
      ".mkv",
      ".mp3",
      ".wav",
      ".m4a",
      ".ogg",
      ".epub",
      ".flac",
    ];
    for (const ext of viewerExtensions) {
      expect(classifyFile(`a${ext}`)).toBe("viewer");
    }
  });

  it("falls back to code for anything else", () => {
    expect(classifyFile("a.ts")).toBe("code");
    expect(classifyFile("Makefile")).toBe("code");
  });
});
