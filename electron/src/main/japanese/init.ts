import { existsSync } from "node:fs";
import { getJapaneseDbPath, initJapaneseSchema, openJapaneseDb, setJapaneseDb } from "./db";
import { openJapaneseUserDb, setJapaneseUserDb } from "./userDb";

export function initJapaneseDictionary(): void {
  try {
    const path = getJapaneseDbPath();
    if (!existsSync(path)) {
      setJapaneseDb(null);
    } else {
      const database = openJapaneseDb(path);
      initJapaneseSchema(database);
      setJapaneseDb(database);
    }
    try {
      setJapaneseUserDb(openJapaneseUserDb());
    } catch {
      setJapaneseUserDb(null);
    }
  } catch {
    setJapaneseDb(null);
    setJapaneseUserDb(null);
  }
}

export function closeJapaneseDictionary(): void {
  setJapaneseDb(null);
  setJapaneseUserDb(null);
}
