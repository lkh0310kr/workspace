import type { ImportContext, ImportResult, Importer } from "../../../shared/model3d/importer";
import { mimeTypeForModelFormat } from "../formatSniffer";
import { model3dLog } from "../model3dLog";
import { toModelUrl } from "../modelProtocolUrl";
import { gltfHasExternalResources } from "../packageResolver";

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

    if (ctx.format === "gltf" && gltfHasExternalResources(ctx.workspaceRoot, ctx.relativePath)) {
      return {
        manifest: {
          version: 1,
          status: "ready",
          source: { path: ctx.relativePath, format: ctx.format },
          readStrategy: "workspace-model",
          modelUrl: toModelUrl(ctx.absolutePath),
          mimeType: mimeTypeForModelFormat(ctx.format),
          warnings: [],
        },
        warnings: [],
      };
    }

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
