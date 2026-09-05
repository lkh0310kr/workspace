import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCacheKey,
  lookupCachedManifest,
  model3dCacheDir,
  storeCachedManifest,
} from "./cacheStore";
import { modelUrlToAbsolutePath } from "./modelProtocolUrl";

const tempDirs: string[] = [];

function makeTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "model3d-cache-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("model3d cacheStore", () => {
  it("builds stable content-address keys", () => {
    const a = buildCacheKey("models/a.step", 100, 200);
    const b = buildCacheKey("models/a.step", 100, 200);
    const c = buildCacheKey("models/a.step", 101, 200);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("round-trips manifest JSON under .workspace/model3d-cache", async () => {
    const root = makeTempWorkspace();
    const key = buildCacheKey("models/part.step", 1, 2);
    const manifest = {
      version: 1 as const,
      status: "ready" as const,
      source: { path: "models/part.step", format: "step" as const },
      readStrategy: "blob-preview" as const,
      mimeType: "model/step",
      warnings: [],
    };
    await storeCachedManifest(root, key, manifest);
    expect(fs.existsSync(path.join(model3dCacheDir(root), `${key}.manifest.json`))).toBe(true);
    const loaded = await lookupCachedManifest(root, key);
    expect(loaded).toEqual(manifest);
  });

  it("rehydrates stale workspace-model URLs from the current workspace root", async () => {
    const root = makeTempWorkspace();
    const key = buildCacheKey("models/part.step", 1, 2);
    const glbPath = path.join(model3dCacheDir(root), `${key}.glb`);
    fs.mkdirSync(path.dirname(glbPath), { recursive: true });
    fs.writeFileSync(glbPath, "glb");
    const staleManifest = {
      version: 1 as const,
      status: "ready" as const,
      source: { path: "models/part.step", format: "step" as const },
      readStrategy: "workspace-model" as const,
      modelUrl: "workspace-model://local/home/wsl/.workspace/model3d-cache/stale.glb",
      mimeType: "model/gltf-binary",
      renderFormat: "glb" as const,
      warnings: [],
    };
    await storeCachedManifest(root, key, staleManifest);
    const loaded = await lookupCachedManifest(root, key);
    expect(loaded?.status).toBe("ready");
    if (loaded?.status !== "ready" || loaded.readStrategy !== "workspace-model") return;
    expect(loaded.modelUrl).not.toContain("/home/wsl/");
    expect(modelUrlToAbsolutePath(loaded.modelUrl)).toBe(glbPath);
  });
});
