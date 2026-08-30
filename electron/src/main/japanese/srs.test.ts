import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openJapaneseUserDb, setJapaneseUserDb } from "./userDb";
import { addSrsCard, listDueSrsCards, reviewSrsCard } from "./srs";

describe("japanese srs", () => {
  let outDir = "";

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "japanese-srs-"));
    setJapaneseUserDb(openJapaneseUserDb(join(outDir, "user.db")));
  });

  afterEach(() => {
    setJapaneseUserDb(null);
    rmSync(outDir, { recursive: true, force: true });
  });

  it("schedules and lists due cards", () => {
    const card = addSrsCard(1000000);
    expect(card.entSeq).toBe(1000000);
    const due = listDueSrsCards();
    expect(due.some((entry) => entry.entSeq === 1000000)).toBe(true);
  });

  it("updates intervals on review", () => {
    addSrsCard(1000001);
    const reviewed = reviewSrsCard(1000001, 4);
    expect(reviewed.interval).toBeGreaterThanOrEqual(1);
    expect(reviewed.ease).toBeGreaterThan(1);
  });
});
