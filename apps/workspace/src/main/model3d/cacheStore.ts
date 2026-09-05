import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { SceneManifest } from "../../shared/model3d/types";

export const MODEL3D_CACHE_CONVERTER_VERSION = "cadgen-glb-1";

/** Workspace-local import cache — `.workspace/model3d-cache/` (gitignored). */
export function model3dCacheDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".workspace", "model3d-cache");
}

export function buildCacheKey(relativePath: string, mtimeMs: number, size: number): string {
  const payload = `${MODEL3D_CACHE_CONVERTER_VERSION}:${relativePath}:${mtimeMs}:${size}`;
  return createHash("sha256").update(payload).digest("hex");
}

function manifestPath(workspaceRoot: string, cacheKey: string): string {
  return path.join(model3dCacheDir(workspaceRoot), `${cacheKey}.manifest.json`);
}

export function convertedGlbPath(workspaceRoot: string, cacheKey: string): string {
  return path.join(model3dCacheDir(workspaceRoot), `${cacheKey}.glb`);
}

export async function lookupCachedManifest(
  workspaceRoot: string,
  cacheKey: string,
): Promise<SceneManifest | null> {
  const file = manifestPath(workspaceRoot, cacheKey);
  try {
    const raw = await fs.promises.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as SceneManifest;
    if (parsed.version !== 1) return null;
    if (parsed.status === "ready" && parsed.readStrategy === "workspace-model") {
      const glbPath = convertedGlbPath(workspaceRoot, cacheKey);
      if (!fs.existsSync(glbPath)) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function storeCachedManifest(
  workspaceRoot: string,
  cacheKey: string,
  manifest: SceneManifest,
): Promise<void> {
  const dir = model3dCacheDir(workspaceRoot);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(manifestPath(workspaceRoot, cacheKey), JSON.stringify(manifest), "utf8");
}
