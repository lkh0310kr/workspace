import type { ImportContext, ImportResult, Importer } from "../../../shared/model3d/importer";
import { mimeTypeForModelFormat } from "../formatSniffer";
import { isLoadableFbxFile } from "../fbxValidate";
import { model3dLog } from "../model3dLog";

export const fbxNativeImporter: Importer = {
  id: "fbx-native",
  formats: ["fbx"],
  capabilities: {
    preserves: ["mesh", "skeleton", "animation"],
    tier: "native",
    packageAware: true,
    maxBytesInProcess: 64 * 1024 * 1024,
  },
  async canImport(ctx: ImportContext): Promise<boolean> {
    return ctx.format === "fbx";
  },
  async import(ctx: ImportContext): Promise<ImportResult> {
    model3dLog("importer_fbx_native", {
      source: "main",
      relativePath: ctx.relativePath,
      format: ctx.format,
    });

    if (!isLoadableFbxFile(ctx.absolutePath)) {
      return {
        manifest: {
          version: 1,
          status: "unsupported",
          source: { path: ctx.relativePath, format: ctx.format },
          message:
            "FBX 파일이 비어 있거나 형식이 올바르지 않습니다. Blender 등에서 보낸 FBX 7.0+ 파일을 사용해 주세요.",
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
        warnings: [
          {
            code: "fbx-preview-limited",
            message: "Some FBX features may not render correctly in this preview.",
          },
        ],
      },
      warnings: [],
    };
  },
};
