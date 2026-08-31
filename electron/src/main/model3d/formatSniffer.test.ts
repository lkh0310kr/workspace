import { describe, expect, it } from "vitest";
import { sniffModelFormat } from "./formatSniffer";

describe("sniffModelFormat", () => {
  it("detects glb magic", () => {
    const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
    expect(sniffModelFormat(bytes, "model.bin")).toBe("glb");
  });

  it("detects fbx binary header", () => {
    const text = "Kaydara FBX Binary  \0";
    const bytes = new TextEncoder().encode(text);
    expect(sniffModelFormat(bytes, "x.bin")).toBe("fbx");
  });

  it("falls back to extension", () => {
    expect(sniffModelFormat(new Uint8Array(), "mesh.obj")).toBe("obj");
    expect(sniffModelFormat(new Uint8Array(), "part.stl")).toBe("stl");
    expect(sniffModelFormat(new Uint8Array(), "scene.gltf")).toBe("gltf");
  });

  it("detects ascii stl header", () => {
    const bytes = new TextEncoder().encode("solid cube\n");
    expect(sniffModelFormat(bytes, "x.stl")).toBe("stl");
  });
});
