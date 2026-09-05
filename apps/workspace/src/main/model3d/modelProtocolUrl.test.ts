import { describe, expect, it } from "vitest";
import { modelUrlToAbsolutePath, posixPathForModelUrl, toModelUrl } from "./modelProtocolUrl";

describe("modelProtocolUrl", () => {
  it("round-trips linux absolute paths", () => {
    const abs = "/home/user/project/.workspace/model3d-cache/part.glb";
    const url = toModelUrl(abs);
    expect(url).toContain("workspace-model://local");
    expect(modelUrlToAbsolutePath(url)).toBe(abs);
  });

  it("encodes windows drive paths with a leading slash", () => {
    expect(posixPathForModelUrl("C:\\Users\\dev\\part.glb")).toBe("/C:/Users/dev/part.glb");
    const url = toModelUrl("C:\\Users\\dev\\part.glb");
    expect(url).toContain("/C%3A/Users/dev/part.glb");
    if (process.platform === "win32") {
      expect(modelUrlToAbsolutePath(url)).toBe("C:\\Users\\dev\\part.glb");
    }
  });
});
