import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { SceneManifest } from "../../shared/model3d/types";
import { toModelUrl } from "./modelProtocolUrl";

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

function workspaceModelAbsolutePath(
  workspaceRoot: string,
  cacheKey: string,
  manifest: Extract<SceneManifest, { status: "ready"; readStrategy: "workspace-model" }>,
): string {
  if (manifest.renderFormat === "glb" && manifest.source.format === "step") {
    return convertedGlbPath(workspaceRoot, cacheKey);
  }
  return path.join(workspaceRoot, manifest.source.path);
}

function rehydrateCachedManifest(
  workspaceRoot: string,
  cacheKey: string,
  manifest: SceneManifest,
): SceneManifest {
  if (manifest.status !== "ready" || manifest.readStrategy !== "workspace-model") {
    return manifest;
  }
  const absolutePath = workspaceModelAbsolutePath(workspaceRoot, cacheKey, manifest);
  return { ...manifest, modelUrl: toModelUrl(absolutePath) };
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
      const target = workspaceModelAbsolutePath(workspaceRoot, cacheKey, parsed);
      if (!fs.existsSync(target)) return null;
    }
    return rehydrateCachedManifest(workspaceRoot, cacheKey, parsed);
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
