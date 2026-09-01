import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gltfHasExternalResources, objHasExternalResources, resolvePackage } from "./packageResolver";

const tempDirs: string[] = [];

function makeTempWorkspace(files: Record<string, Buffer | string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "package-resolver-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("packageResolver", () => {
  it("detects external gltf buffer references", () => {
    const root = makeTempWorkspace({
      "models/box.gltf": JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ uri: "box.bin", byteLength: 8 }],
      }),
      "models/box.bin": Buffer.alloc(8),
    });
    expect(gltfHasExternalResources(root, "models/box.gltf")).toBe(true);
    const pkg = resolvePackage(root, "models/box.gltf");
    expect(pkg.siblings).toContain("box.bin");
    expect(pkg.resolve("box.bin")).toBe("models/box.bin");
  });

  it("returns false for embedded gltf", () => {
    const root = makeTempWorkspace({
      "models/box.gltf": JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ byteLength: 8 }],
      }),
    });
    expect(gltfHasExternalResources(root, "models/box.gltf")).toBe(false);
  });

  it("detects obj mtl references", () => {
    const root = makeTempWorkspace({
      "models/cube.obj": "mtllib cube.mtl\no Cube\nv 0 0 0\n",
      "models/cube.mtl": "newmtl mat\ncolor 1 1 1\n",
    });
    expect(objHasExternalResources(root, "models/cube.obj")).toBe(true);
    const pkg = resolvePackage(root, "models/cube.obj");
    expect(pkg.siblings).toContain("cube.mtl");
    expect(pkg.resolve("cube.mtl")).toBe("models/cube.mtl");
  });
});
