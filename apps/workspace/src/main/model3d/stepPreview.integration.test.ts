import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openModelPreview } from "./assetRouter";
import { findCadgenBinary } from "./stepConvert";

const REPO_ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..", "..");
const BRACKET = "models/m3-bracket/bracket.step";

describe("openModelPreview STEP integration", () => {
  it("converts bracket.step to cached glb when cadgen is installed", async () => {
    const bracketAbs = path.join(REPO_ROOT, BRACKET);
    if (!findCadgenBinary(REPO_ROOT) || !existsSync(bracketAbs)) {
      console.warn("Skipping STEP preview integration — run agents:python:setup first");
      return;
    }

    const first = await openModelPreview({ workspaceRoot: REPO_ROOT, relativePath: BRACKET });
    expect(first.status).toBe("ready");
    if (first.status !== "ready") return;
    expect(first.source.format).toBe("step");
    expect(first.readStrategy).toBe("workspace-model");
    expect(first.renderFormat).toBe("glb");
    expect(first.modelUrl).toContain("workspace-model://");

    const second = await openModelPreview({ workspaceRoot: REPO_ROOT, relativePath: BRACKET });
    expect(second.status).toBe("ready");
    if (second.status !== "ready") return;
    expect(second.modelUrl).toBe(first.modelUrl);
  }, 120_000);
});
