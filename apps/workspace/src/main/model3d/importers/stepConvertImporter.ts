import * as fs from "node:fs";
import type { ImportContext, ImportResult, Importer } from "../../../shared/model3d/importer";
import { buildCacheKey, convertedGlbPath, model3dCacheDir } from "../cacheStore";
import { mimeTypeForModelFormat } from "../formatSniffer";
import { model3dLog } from "../model3dLog";
import { toModelUrl } from "../modelProtocolUrl";
import { convertStepToGlb, findCadgenBinary } from "../stepConvert";

export const stepConvertImporter: Importer = {
  id: "step-occt-delegate",
  formats: ["step"],
  capabilities: {
    preserves: ["mesh"],
    tier: "convert-heavy",
    packageAware: false,
    maxBytesInProcess: 128 * 1024 * 1024,
  },
  async canImport(ctx: ImportContext): Promise<boolean> {
    return ctx.format === "step";
  },
  async import(ctx: ImportContext): Promise<ImportResult> {
    model3dLog("importer_step_convert_start", {
      source: "main",
      relativePath: ctx.relativePath,
    });

    const cadgen = findCadgenBinary(ctx.workspaceRoot);
    if (!cadgen) {
      return {
        manifest: {
          version: 1,
          status: "unsupported",
          source: { path: ctx.relativePath, format: "step" },
          message:
            "STEP preview needs cadgen (OCCT). From the repo root run: npm run agents:python:setup",
          warnings: [],
        },
        warnings: [],
      };
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(ctx.absolutePath);
    } catch (err) {
      throw err;
    }

    const cacheKey = buildCacheKey(ctx.relativePath, stat.mtimeMs, stat.size);
    const glbAbs = convertedGlbPath(ctx.workspaceRoot, cacheKey);
    await fs.promises.mkdir(model3dCacheDir(ctx.workspaceRoot), { recursive: true });

    const converted = await convertStepToGlb(cadgen, ctx.absolutePath, glbAbs, ctx.workspaceRoot);
    if (!converted.ok) {
      model3dLog("importer_step_convert_failed", {
        source: "main",
        relativePath: ctx.relativePath,
        error: converted.error,
      });
      return {
        manifest: {
          version: 1,
          status: "unsupported",
          source: { path: ctx.relativePath, format: "step" },
          message: converted.error,
          warnings: [],
        },
        warnings: [],
      };
    }

    const warnings = converted.warnings.map((message) => ({
      code: "step-convert",
      message,
    }));

    model3dLog("importer_step_convert_done", {
      source: "main",
      relativePath: ctx.relativePath,
      cacheKey,
      glbPath: glbAbs,
      warningCount: warnings.length,
    });

    return {
      manifest: {
        version: 1,
        status: "ready",
        source: { path: ctx.relativePath, format: "step" },
        readStrategy: "workspace-model",
        modelUrl: toModelUrl(glbAbs),
        mimeType: mimeTypeForModelFormat("glb"),
        renderFormat: "glb",
        warnings,
      },
      warnings,
    };
  },
};
