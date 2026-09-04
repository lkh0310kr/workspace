import type { SceneManifest } from "../../shared/model3d/types";

/** Disk cache stub — passthrough until M1 workspace-model:// + cache keys land. */
export async function lookupCachedManifest(_cacheKey: string): Promise<SceneManifest | null> {
  return null;
}

export async function storeCachedManifest(_cacheKey: string, _manifest: SceneManifest): Promise<void> {
  // no-op
}

export function buildCacheKey(relativePath: string, mtimeMs: number, size: number): string {
  return `${relativePath}:${mtimeMs}:${size}`;
}
