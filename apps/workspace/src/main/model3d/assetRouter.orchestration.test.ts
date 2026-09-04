import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { routeAssetOpen } from "./assetRouter";

const tempDirs: string[] = [];

function makeTempWorkspace(files: Record<string, Buffer | string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "model-route-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("routeAssetOpen", () => {
  it("preview intent completes import job with manifest", async () => {
    const glbHeader = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
    const root = makeTempWorkspace({ "models/box.glb": glbHeader });
    const job = await routeAssetOpen(
      { tabId: 1, relativePath: "models/box.glb", intent: "preview", source: "tree" },
      root,
    );
    expect(job.phase).toBe("ready");
    expect(job.pipeline).toBe("import-preview");
    expect(job.manifest?.status).toBe("ready");
  });

  it("place intent uses import-preview pipeline", async () => {
    const root = makeTempWorkspace({ "models/box.obj": "o Box\nv 0 0 0\n" });
    const job = await routeAssetOpen(
      { tabId: 1, relativePath: "models/box.obj", intent: "place", source: "tree" },
      root,
    );
    expect(job.pipeline).toBe("import-preview");
    expect(job.phase).toBe("ready");
  });

  it("edit intent fails fast without importer", async () => {
    const root = makeTempWorkspace({ "models/part.step": "ISO-10303-21;\n" });
    const job = await routeAssetOpen(
      { tabId: 1, relativePath: "models/part.step", intent: "edit", source: "tree" },
      root,
    );
    expect(job.pipeline).toBe("external-cad-edit");
    expect(job.phase).toBe("failed");
    expect(job.error).toContain("Phase 56");
  });
});
