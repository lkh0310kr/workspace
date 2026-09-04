export const MODEL_SCHEME = "workspace-model";

const MODEL_HOST = "local";

function buildModelUrl(host: string, absolutePath: string): string {
  const encodedPath = absolutePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${MODEL_SCHEME}://${host}${encodedPath}`;
}

export function toModelUrl(absolutePath: string): string {
  return buildModelUrl(MODEL_HOST, absolutePath);
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
