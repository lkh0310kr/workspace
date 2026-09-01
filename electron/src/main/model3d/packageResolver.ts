import * as fs from "node:fs";
import * as path from "node:path";
import { resolveUnderRoot } from "../files";

export interface ResolvedPackage {
  primaryPath: string;
  rootDir: string;
  siblings: string[];
  resolve(relativeUri: string): string | null;
}

function normalizeRelativeUri(uri: string): string | null {
  if (!uri || uri.startsWith("data:") || /^https?:/i.test(uri)) return null;
  const cleaned = uri.split("#")[0]?.split("?")[0]?.trim();
  if (!cleaned) return null;
  return cleaned.replace(/\\/g, "/");
}

function collectGltfExternalUris(gltfJson: unknown): string[] {
  const uris: string[] = [];
  if (!gltfJson || typeof gltfJson !== "object") return uris;
  const doc = gltfJson as Record<string, unknown>;

  const buffers = doc.buffers;
  if (Array.isArray(buffers)) {
    for (const buffer of buffers) {
      if (buffer && typeof buffer === "object" && typeof (buffer as { uri?: unknown }).uri === "string") {
        const rel = normalizeRelativeUri((buffer as { uri: string }).uri);
        if (rel) uris.push(rel);
      }
    }
  }

  const images = doc.images;
  if (Array.isArray(images)) {
    for (const image of images) {
      if (image && typeof image === "object" && typeof (image as { uri?: unknown }).uri === "string") {
        const rel = normalizeRelativeUri((image as { uri: string }).uri);
        if (rel) uris.push(rel);
      }
    }
  }

  return [...new Set(uris)];
}

function collectObjExternalUris(objText: string): string[] {
  const uris: string[] = [];
  for (const line of objText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.toLowerCase().startsWith("mtllib ")) {
      const mtl = trimmed.slice(7).trim();
      if (mtl) uris.push(mtl.replace(/\\/g, "/"));
    }
  }
  return [...new Set(uris)];
}

function collectMtlTextureUris(mtlText: string): string[] {
  const uris: string[] = [];
  for (const line of mtlText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const lower = trimmed.toLowerCase();
    const textureKeys = ["map_kd", "map_ka", "map_ks", "map_ns", "map_d", "map_bump", "bump", "disp", "decal", "refl"];
    for (const key of textureKeys) {
      if (lower.startsWith(`${key} `)) {
        const texture = trimmed.slice(key.length).trim().split(/\s+/)[0];
        if (texture) uris.push(texture.replace(/\\/g, "/"));
      }
    }
  }
  return [...new Set(uris)];
}

export function gltfHasExternalResources(workspaceRoot: string, relativePath: string): boolean {
  const absolutePath = resolveUnderRoot(workspaceRoot, relativePath);
  try {
    const text = fs.readFileSync(absolutePath, "utf8");
    const json = JSON.parse(text) as unknown;
    return collectGltfExternalUris(json).length > 0;
  } catch {
    return false;
  }
}

export function objHasExternalResources(workspaceRoot: string, relativePath: string): boolean {
  const absolutePath = resolveUnderRoot(workspaceRoot, relativePath);
  try {
    const text = fs.readFileSync(absolutePath, "utf8");
    const mtlRefs = collectObjExternalUris(text);
    if (mtlRefs.length === 0) return false;
    const packageDir = path.dirname(absolutePath);
    for (const mtlRef of mtlRefs) {
      const mtlPath = path.resolve(packageDir, mtlRef);
      if (!fs.existsSync(mtlPath)) continue;
      const mtlText = fs.readFileSync(mtlPath, "utf8");
      const textures = collectMtlTextureUris(mtlText);
      if (textures.length > 0) return true;
    }
    return mtlRefs.length > 0;
  } catch {
    return false;
  }
}

export function resolvePackage(workspaceRoot: string, relativePath: string): ResolvedPackage {
  const realWorkspaceRoot = fs.realpathSync(workspaceRoot);
  const absolutePath = resolveUnderRoot(workspaceRoot, relativePath);
  const packageDir = path.dirname(absolutePath);
  const ext = path.extname(relativePath).toLowerCase();
  const siblings = new Set<string>();

  if (ext === ".gltf") {
    try {
      const text = fs.readFileSync(absolutePath, "utf8");
      const json = JSON.parse(text) as unknown;
      for (const uri of collectGltfExternalUris(json)) {
        siblings.add(uri);
      }
    } catch {
      // leave siblings empty
    }
  } else if (ext === ".obj") {
    try {
      const text = fs.readFileSync(absolutePath, "utf8");
      for (const mtlRef of collectObjExternalUris(text)) {
        siblings.add(mtlRef);
        const mtlPath = path.resolve(packageDir, mtlRef);
        if (fs.existsSync(mtlPath)) {
          const mtlText = fs.readFileSync(mtlPath, "utf8");
          for (const tex of collectMtlTextureUris(mtlText)) {
            siblings.add(tex);
          }
        }
      }
    } catch {
      // leave siblings empty
    }
  }

  return {
    primaryPath: relativePath,
    rootDir: path.relative(realWorkspaceRoot, packageDir) || ".",
    siblings: [...siblings],
    resolve(relativeUri: string): string | null {
      const normalized = normalizeRelativeUri(relativeUri);
      if (!normalized) return null;
      const resolved = path.resolve(packageDir, normalized);
      try {
        const realResolved = fs.realpathSync(resolved);
        if (!(realResolved === realWorkspaceRoot || realResolved.startsWith(realWorkspaceRoot + path.sep))) {
          return null;
        }
        const rel = path.relative(realWorkspaceRoot, realResolved);
        return rel.split(path.sep).join("/");
      } catch {
        return null;
      }
    },
  };
}
