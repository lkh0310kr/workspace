import type { DetectedModelFormat } from "../../shared/model3d/types";

const GLB_MAGIC = new Uint8Array([0x67, 0x6c, 0x54, 0x46]); // glTF

function readHeader(bytes: Uint8Array, length: number): string {
  return new TextDecoder("ascii").decode(bytes.subarray(0, Math.min(length, bytes.length)));
}

export function sniffModelFormat(bytes: Uint8Array, fileName: string): DetectedModelFormat {
  if (bytes.length >= 4) {
    if (
      bytes[0] === GLB_MAGIC[0] &&
      bytes[1] === GLB_MAGIC[1] &&
      bytes[2] === GLB_MAGIC[2] &&
      bytes[3] === GLB_MAGIC[3]
    ) {
      return "glb";
    }
  }

  const header = readHeader(bytes, 64).trimStart();
  if (header.startsWith("Kaydara FBX Binary") || header.startsWith("; FBX")) {
    return "fbx";
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".gltf")) return "gltf";
  if (lowerName.endsWith(".glb")) return "glb";
  if (lowerName.endsWith(".fbx")) return "fbx";
  if (lowerName.endsWith(".obj")) return "obj";
  if (lowerName.endsWith(".stl")) return "stl";
  if (lowerName.endsWith(".ply")) return "ply";
  if (lowerName.endsWith(".dae")) return "dae";

  if (header.startsWith("solid ") || header.startsWith("SOLID ")) return "stl";
  if (header.startsWith("ply") || header.startsWith("PLY")) return "ply";
  if (header.startsWith("v ") || header.startsWith("o ") || header.startsWith("#")) return "obj";

  return "unknown";
}

export function mimeTypeForModelFormat(format: DetectedModelFormat): string {
  switch (format) {
    case "glb":
      return "model/gltf-binary";
    case "gltf":
      return "model/gltf+json";
    case "fbx":
      return "application/octet-stream";
    case "obj":
      return "model/obj";
    case "stl":
      return "model/stl";
    case "ply":
      return "application/octet-stream";
    case "dae":
      return "model/vnd.collada+xml";
    default:
      return "application/octet-stream";
  }
}
