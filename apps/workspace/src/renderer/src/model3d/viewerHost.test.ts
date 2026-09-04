import { describe, expect, it } from "vitest";
import { getDefaultViewerBackend } from "./viewerHost";

describe("viewerHost", () => {
  it("returns the default webgl-three backend", () => {
    const backend = getDefaultViewerBackend();
    expect(backend.id).toBe("webgl-three");
    expect(backend.supports(["orbit", "pbr"])).toBe(true);
    expect(backend.supports(["raytracing"])).toBe(false);
  });
});
