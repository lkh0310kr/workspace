import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readFileBinaryPreview } from "./files";

const tempDirs: string[] = [];

function makeTempRoot(files: Record<string, Buffer>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "files-preview-"));
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

describe("readFileBinaryPreview", () => {
  it("reads glb files", () => {
    const glbHeader = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
    const root = makeTempRoot({ "box.glb": glbHeader });
    const preview = readFileBinaryPreview(root, "box.glb");
    expect(preview).not.toBeNull();
    expect(preview?.mimeType).toBe("model/gltf-binary");
    expect(preview?.content.length).toBeGreaterThan(0);
  });

  it("reads obj files", () => {
    const root = makeTempRoot({ "cube.obj": Buffer.from("o Cube\nv 0 0 0\n") });
    const preview = readFileBinaryPreview(root, "cube.obj");
    expect(preview).not.toBeNull();
    expect(preview?.mimeType).toBe("model/obj");
  });

  it("reads stl files", () => {
    const root = makeTempRoot({ "cube.stl": Buffer.from("solid cube\nendsolid cube\n") });
    const preview = readFileBinaryPreview(root, "cube.stl");
    expect(preview).not.toBeNull();
    expect(preview?.mimeType).toBe("model/stl");
  });

  it("returns null for unknown extensions", () => {
    const root = makeTempRoot({ "readme.txt": Buffer.from("hi") });
    expect(readFileBinaryPreview(root, "readme.txt")).toBeNull();
  });
});
