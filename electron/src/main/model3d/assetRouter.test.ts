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

  it("returns unsupported manifest for fbx stub", async () => {
    const fbxHeader = Buffer.from("Kaydara FBX Binary  \0", "ascii");
    const root = makeTempWorkspace({ "models/box.fbx": fbxHeader });
    const manifest = await openModelPreview({ workspaceRoot: root, relativePath: "models/box.fbx" });
    expect(manifest.status).toBe("unsupported");
    if (manifest.status === "unsupported") {
      expect(manifest.source.format).toBe("fbx");
      expect(manifest.message).toContain("준비 중");
    }
  });
});
