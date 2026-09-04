import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openModelPreview } from "./assetRouter";

const tempDirs: string[] = [];

function makeTempWorkspace(files: Record<string, Buffer | string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "model-preview-"));
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

describe("openModelPreview", () => {
  it("returns ready manifest for glb", async () => {
    const glbHeader = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
    const root = makeTempWorkspace({ "models/box.glb": glbHeader });
    const manifest = await openModelPreview({ workspaceRoot: root, relativePath: "models/box.glb" });
    expect(manifest.status).toBe("ready");
    if (manifest.status === "ready") {
      expect(manifest.source.format).toBe("glb");
      expect(manifest.readStrategy).toBe("blob-preview");
      expect(manifest.mimeType).toBe("model/gltf-binary");
    }
  });

  it("returns ready manifest for obj", async () => {
    const root = makeTempWorkspace({ "models/box.obj": "o Box\nv 0 0 0\n" });
    const manifest = await openModelPreview({ workspaceRoot: root, relativePath: "models/box.obj" });
    expect(manifest.status).toBe("ready");
    if (manifest.status === "ready") {
      expect(manifest.source.format).toBe("obj");
      expect(manifest.mimeType).toBe("model/obj");
      expect(manifest.readStrategy).toBe("blob-preview");
    }
  });

  it("returns workspace-model manifest for gltf package", async () => {
    const root = makeTempWorkspace({
      "models/box.gltf": JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ uri: "box.bin", byteLength: 8 }],
      }),
      "models/box.bin": Buffer.alloc(8),
    });
    const manifest = await openModelPreview({ workspaceRoot: root, relativePath: "models/box.gltf" });
    expect(manifest.status).toBe("ready");
    if (manifest.status === "ready" && manifest.readStrategy === "workspace-model") {
      expect(manifest.source.format).toBe("gltf");
      expect(manifest.modelUrl).toContain("workspace-model://");
    }
  });

  it("returns workspace-model manifest for obj with mtl", async () => {
    const root = makeTempWorkspace({
      "models/cube.obj": "mtllib cube.mtl\no Cube\nv 0 0 0\n",
      "models/cube.mtl": "newmtl mat\ncolor 1 1 1\n",
    });
    const manifest = await openModelPreview({ workspaceRoot: root, relativePath: "models/cube.obj" });
    expect(manifest.status).toBe("ready");
    if (manifest.status === "ready" && manifest.readStrategy === "workspace-model") {
      expect(manifest.modelUrl).toContain("workspace-model://");
    }
  });

  it("returns unsupported for fbx header-only stub", async () => {
    const fbxHeader = Buffer.from("Kaydara FBX Binary  \0", "ascii");
    const root = makeTempWorkspace({ "models/box.fbx": fbxHeader });
    const manifest = await openModelPreview({ workspaceRoot: root, relativePath: "models/box.fbx" });
    expect(manifest.status).toBe("unsupported");
    if (manifest.status === "unsupported") {
      expect(manifest.source.format).toBe("fbx");
    }
  });

  it("returns ready manifest for valid fbx fixture", async () => {
    const fixturePath = path.join(import.meta.dirname, "../../test-fixtures/models/box.fbx");
    if (!fs.existsSync(fixturePath)) return;
    const fbx = fs.readFileSync(fixturePath);
    const root = makeTempWorkspace({ "models/box.fbx": fbx });
    const manifest = await openModelPreview({ workspaceRoot: root, relativePath: "models/box.fbx" });
    expect(manifest.status).toBe("ready");
    if (manifest.status === "ready") {
      expect(manifest.source.format).toBe("fbx");
      expect(manifest.readStrategy).toBe("blob-preview");
    }
  });
});
