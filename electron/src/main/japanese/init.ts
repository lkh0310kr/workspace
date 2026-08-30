import { existsSync } from "node:fs";
import { getJapaneseDbPath, initJapaneseSchema, openJapaneseDb, setJapaneseDb } from "./db";
import { getJapaneseDbStatus } from "./service";
import { openJapaneseUserDb, setJapaneseUserDb } from "./userDb";

function openDictionaryFromDisk(): void {
  const path = getJapaneseDbPath();
  if (!existsSync(path)) {
    setJapaneseDb(null);
    return;
  }
  const database = openJapaneseDb(path);
  initJapaneseSchema(database);
  setJapaneseDb(database);
}

export function initJapaneseDictionary(): void {
  try {
    openDictionaryFromDisk();
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

export function reloadJapaneseDictionary() {
  setJapaneseDb(null);
  openDictionaryFromDisk();
  return getJapaneseDbStatus();
}

export function closeJapaneseDictionary(): void {
  setJapaneseDb(null);
  setJapaneseUserDb(null);
}
