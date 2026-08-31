import * as fs from "node:fs";
import * as path from "node:path";
import type { ImportContext } from "../../shared/model3d/importer";
import type { SceneManifest } from "../../shared/model3d/types";
import { buildCacheKey, lookupCachedManifest, storeCachedManifest } from "./cacheStore";
import { sniffModelFormat } from "./formatSniffer";
import { findImporter } from "./importerRegistry";
import { model3dLog, getModel3dLogPath } from "./model3dLog";

export interface OpenModelPreviewInput {
  workspaceRoot: string;
  relativePath: string;
  tabId?: number;
}

export async function openModelPreview(input: OpenModelPreviewInput): Promise<SceneManifest> {
  const absolutePath = path.join(input.workspaceRoot, input.relativePath);
  model3dLog("open_preview_start", {
    source: "main",
    logPath: getModel3dLogPath(),
    tabId: input.tabId ?? null,
    relativePath: input.relativePath,
    workspaceRoot: input.workspaceRoot,
    absolutePath,
  });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch (err) {
    model3dLog("open_preview_stat_failed", {
      source: "main",
      relativePath: input.relativePath,
      absolutePath,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (!stat.isFile()) {
    model3dLog("open_preview_not_file", {
      source: "main",
      relativePath: input.relativePath,
      absolutePath,
    });
    throw new Error("Not a file");
  }

  const cacheKey = buildCacheKey(input.relativePath, stat.mtimeMs, stat.size);
  const cached = await lookupCachedManifest(cacheKey);
  if (cached) {
    model3dLog("open_preview_cache_hit", {
      source: "main",
      relativePath: input.relativePath,
      cacheKey,
      status: cached.status,
      format: cached.source.format,
    });
    return cached;
  }

  const fd = fs.openSync(absolutePath, "r");
  try {
    const header = Buffer.alloc(Math.min(256, stat.size));
    fs.readSync(fd, header, 0, header.length, 0);
    const format = sniffModelFormat(new Uint8Array(header), path.basename(absolutePath));
    model3dLog("open_preview_sniffed", {
      source: "main",
      relativePath: input.relativePath,
      format,
      byteLength: stat.size,
      headerHex: header.subarray(0, 16).toString("hex"),
    });

    const importer = findImporter(format);
    if (!importer) {
      const manifest: SceneManifest = {
        version: 1,
        status: "unsupported",
        source: { path: input.relativePath, format },
        message: "지원되지 않는 3D 파일 형식입니다.",
        warnings: [],
      };
      model3dLog("open_preview_no_importer", {
        source: "main",
        relativePath: input.relativePath,
        format,
        status: manifest.status,
      });
      return manifest;
    }

    const ctx: ImportContext = {
      absolutePath,
      relativePath: input.relativePath,
      packageRoot: path.dirname(absolutePath),
      format,
    };
    model3dLog("open_preview_import_start", {
      source: "main",
      relativePath: input.relativePath,
      importerId: importer.id,
      format,
    });
    const result = await importer.import(ctx);
    await storeCachedManifest(cacheKey, result.manifest);
    model3dLog("open_preview_import_done", {
      source: "main",
      relativePath: input.relativePath,
      importerId: importer.id,
      status: result.manifest.status,
      format: result.manifest.source.format,
      readStrategy: result.manifest.status === "ready" ? result.manifest.readStrategy : null,
      message: result.manifest.status === "unsupported" ? result.manifest.message : null,
    });
    return result.manifest;
  } catch (err) {
    model3dLog("open_preview_failed", {
      source: "main",
      relativePath: input.relativePath,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  } finally {
    fs.closeSync(fd);
  }
}
