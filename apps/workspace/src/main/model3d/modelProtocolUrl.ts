import * as path from "node:path";

export const MODEL_SCHEME = "workspace-model";

const MODEL_HOST = "local";

/** Absolute path → URL pathname segment (forward slashes, leading /, Windows drive safe). */
export function posixPathForModelUrl(absolutePath: string): string {
  const forward = absolutePath.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(forward)) {
    return `/${forward}`;
  }
  const resolved = path.resolve(absolutePath);
  const resolvedForward = resolved.split(path.sep).join("/");
  if (/^[A-Za-z]:/.test(resolvedForward)) return `/${resolvedForward}`;
  return resolvedForward.startsWith("/") ? resolvedForward : `/${resolvedForward}`;
}

function buildModelUrl(host: string, absolutePath: string): string {
  const normalized = posixPathForModelUrl(absolutePath);
  const encodedPath = normalized
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${MODEL_SCHEME}://${host}${encodedPath}`;
}

export function toModelUrl(absolutePath: string): string {
  return buildModelUrl(MODEL_HOST, absolutePath);
}

/** Inverse of toModelUrl — used by the custom protocol handler. */
export function modelUrlToAbsolutePath(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== MODEL_HOST) return null;
    let absolutePath = decodeURIComponent(parsed.pathname);
    if (/^\/[A-Za-z]:/.test(absolutePath)) {
      absolutePath = absolutePath.slice(1);
    }
    return path.resolve(absolutePath);
  } catch {
    return null;
  }
}

export const MODEL_MIME_TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".obj": "model/obj",
  ".mtl": "model/mtl",
  ".stl": "model/stl",
  ".ply": "application/octet-stream",
  ".dae": "model/vnd.collada+xml",
  ".fbx": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ktx2": "image/ktx2",
  ".basis": "application/octet-stream",
};
