import type { ImportContext, ImportResult, Importer } from "../../../shared/model3d/importer";
import type { DetectedModelFormat } from "../../../shared/model3d/types";
import { mimeTypeForModelFormat } from "../formatSniffer";
import { model3dLog } from "../model3dLog";

const MESH_FORMATS: DetectedModelFormat[] = ["obj", "stl", "ply", "dae"];

/** Tier-1 mesh formats rendered directly in the Three.js viewer (docs/planning/3d-model-viewer-architecture.md §4.3). */
export const meshNativeImporter: Importer = {
  id: "mesh-native",
  formats: MESH_FORMATS,
  capabilities: {
    preserves: ["mesh"],
    tier: "native",
    packageAware: false,
    maxBytesInProcess: 32 * 1024 * 1024,
  },
  async canImport(ctx: ImportContext): Promise<boolean> {
    return MESH_FORMATS.includes(ctx.format);
  },
  async import(ctx: ImportContext): Promise<ImportResult> {
    model3dLog("importer_mesh_native", {
      source: "main",
      relativePath: ctx.relativePath,
      format: ctx.format,
    });
    return {
      manifest: {
        version: 1,
        status: "ready",
        source: { path: ctx.relativePath, format: ctx.format },
        readStrategy: "blob-preview",
        mimeType: mimeTypeForModelFormat(ctx.format),
        warnings:
          ctx.format === "obj"
            ? [
                {
                  code: "obj-materials-omitted",
                  message: "OBJ materials/textures are not loaded in this preview yet.",
                },
              ]
            : [],
      },
      warnings: [],
    };
  },
};
