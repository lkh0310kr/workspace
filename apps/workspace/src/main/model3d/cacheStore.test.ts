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
});
