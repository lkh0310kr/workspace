import { existsSync } from "node:fs";
import {
  getJapaneseDbPath,
  initJapaneseSchema,
  openJapaneseDb,
  setJapaneseDb,
} from "./db";

export function initJapaneseDictionary(): void {
  try {
    const path = getJapaneseDbPath();
    if (!existsSync(path)) {
      setJapaneseDb(null);
      return;
    }
    const database = openJapaneseDb(path);
    initJapaneseSchema(database);
    setJapaneseDb(database);
  } catch {
    setJapaneseDb(null);
  }
}

export function closeJapaneseDictionary(): void {
  setJapaneseDb(null);
}
