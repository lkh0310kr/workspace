import type { ImportContext, ImportResult, Importer } from "../../../shared/model3d/importer";
import { model3dLog } from "../model3dLog";

const STUB_FORMATS: never[] = [];

export const stubImporter: Importer = {
  id: "convert-stub",
  formats: STUB_FORMATS,
  capabilities: {
    preserves: ["mesh"],
    tier: "convert-heavy",
    packageAware: true,
  },
  async canImport(_ctx: ImportContext): Promise<boolean> {
    return false;
  },
  async import(ctx: ImportContext): Promise<ImportResult> {
    const label = ctx.format.toUpperCase();
    model3dLog("importer_stub", {
      source: "main",
      relativePath: ctx.relativePath,
      format: ctx.format,
    });
    return {
      manifest: {
        version: 1,
        status: "unsupported",
        source: { path: ctx.relativePath, format: ctx.format },
        message: `${label} 미리보기 변환은 아직 준비 중입니다. GLB/GLTF 파일을 사용해 주세요.`,
        warnings: [],
      },
      warnings: [],
    };
  },
};
