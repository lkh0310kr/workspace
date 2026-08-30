import { connectJapaneseDbFromCandidates, setJapaneseDb } from "./db";
import { japaneseLog } from "./japaneseLog";
import { getJapaneseDbStatus } from "./service";
import { openJapaneseUserDb, setJapaneseUserDb } from "./userDb";

export function initJapaneseDictionary(): void {
  japaneseLog("init_start");
  try {
    const { path, ready } = connectJapaneseDbFromCandidates();
    if (!ready) {
      setJapaneseDb(null);
      japaneseLog("init_not_ready", { path });
    }
    try {
      setJapaneseUserDb(openJapaneseUserDb());
    } catch (err) {
      japaneseLog("user_db_init_error", { error: err instanceof Error ? err.message : String(err) });
      setJapaneseUserDb(null);
    }
    const status = getJapaneseDbStatus();
    japaneseLog("init_done", {
      ready: status.ready,
      path: status.path,
      loadedPath: status.loadedPath,
      entryCount: status.entryCount,
    });
  } catch (err) {
    japaneseLog("init_error", { error: err instanceof Error ? err.message : String(err) });
    setJapaneseDb(null);
    setJapaneseUserDb(null);
  }
}

export function reloadJapaneseDictionary() {
  japaneseLog("reload_start");
  setJapaneseDb(null);
  const result = connectJapaneseDbFromCandidates();
  const status = getJapaneseDbStatus();
  japaneseLog("reload_done", {
    path: result.path,
    ready: result.ready,
    statusReady: status.ready,
    entryCount: status.entryCount,
    loadedPath: status.loadedPath,
  });
  return status;
}

export function closeJapaneseDictionary(): void {
  setJapaneseDb(null);
  setJapaneseUserDb(null);
}
