import type { ImportContext, ImportResult, Importer } from "../../../shared/model3d/importer";
import { mimeTypeForModelFormat } from "../formatSniffer";
import { model3dLog } from "../model3dLog";

export const gltfNativeImporter: Importer = {
  id: "gltf-native",
  formats: ["glb", "gltf"],
  capabilities: {
    preserves: ["mesh", "pbr", "skeleton", "animation"],
    tier: "native",
    packageAware: true,
    maxBytesInProcess: 64 * 1024 * 1024,
  },
  async canImport(ctx: ImportContext): Promise<boolean> {
    return ctx.format === "glb" || ctx.format === "gltf";
  },
  async import(ctx: ImportContext): Promise<ImportResult> {
    model3dLog("importer_gltf_native", {
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
        warnings: [],
      },
      warnings: [],
    };
  },
};
