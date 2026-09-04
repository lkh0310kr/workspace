import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importDictionary } from "../../../scripts/japanese/import-core.mjs";
import { setJapaneseDb } from "./db";
import { initJapaneseDictionary, reloadJapaneseDictionary } from "./init";
import { getJapaneseDbStatus } from "./service";

const fixturesDir = join(import.meta.dirname, "../../../test-fixtures/japanese");

describe("reloadJapaneseDictionary", () => {
  let outDir = "";

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "japanese-reload-"));
    process.env.WORKSPACE_JAPANESE_USER_DATA = outDir;
    setJapaneseDb(null);
  });

  afterEach(() => {
    setJapaneseDb(null);
    delete process.env.WORKSPACE_JAPANESE_USER_DATA;
    rmSync(outDir, { recursive: true, force: true });
  });

  it("picks up a newly imported database without restart", async () => {
    initJapaneseDictionary();
    expect(getJapaneseDbStatus().ready).toBe(false);

    const outPath = join(outDir, "japanese", "dictionary.db");
    await importDictionary({
      outPath,
      jmdictPath: join(fixturesDir, "jmdict-sample.xml"),
      kanjidicPath: join(fixturesDir, "kanjidic-sample.xml"),
    });

    const status = reloadJapaneseDictionary();
    expect(status.ready).toBe(true);
    expect(status.entryCount).toBe(5);
  });
});
