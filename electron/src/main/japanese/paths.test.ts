import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importDictionary } from "../../../scripts/japanese/import-core.mjs";
import { defaultDictionaryDbPath } from "../../../scripts/japanese/paths.mjs";

const fixturesDir = join(import.meta.dirname, "../../../test-fixtures/japanese");

describe("japanese db path resolution", () => {
  let outDir = "";

  afterEach(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
    delete process.env.WORKSPACE_JAPANESE_USER_DATA;
  });

  it("resolves dev fixture db via WORKSPACE_JAPANESE_USER_DATA candidate", async () => {
    outDir = mkdtempSync(join(tmpdir(), "japanese-paths-"));
    process.env.WORKSPACE_JAPANESE_USER_DATA = outDir;
    const outPath = join(outDir, "japanese", "dictionary.db");
    await importDictionary({
      outPath,
      jmdictPath: join(fixturesDir, "jmdict-sample.xml"),
      kanjidicPath: join(fixturesDir, "kanjidic-sample.xml"),
    });

    const { resolveJapaneseDictionaryDbPath } = await import("./paths");
    expect(resolveJapaneseDictionaryDbPath()).toBe(outPath);
  });

  it("cli default path uses workspace-app-dev suffix", () => {
    const path = defaultDictionaryDbPath({ packaged: false });
    expect(path).toContain("workspace-app-dev");
  });
});
