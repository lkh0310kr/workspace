import { connectJapaneseDbFromCandidates, setJapaneseDb } from "./db";
import { japaneseLog } from "./japaneseLog";
import { getJapaneseDbStatus, invalidateKanjiStrokeReferenceCache } from "./service";
import { getKanjiStrokeReferences } from "./strokeReferenceCache";
import { openJapaneseUserDb, setJapaneseUserDb } from "./userDb";

function warmStrokeReferenceCache(): void {
  setImmediate(() => {
    try {
      getKanjiStrokeReferences();
      japaneseLog("stroke_cache_warmed");
    } catch (err) {
      japaneseLog("stroke_cache_warm_error", { error: err instanceof Error ? err.message : String(err) });
    }
  });
}

export function initJapaneseDictionary(): void {
  japaneseLog("init_start");
  try {
    const { path, ready } = connectJapaneseDbFromCandidates();
    if (!ready) {
      setJapaneseDb(null);
      invalidateKanjiStrokeReferenceCache();
      japaneseLog("init_not_ready", { path });
    } else {
      warmStrokeReferenceCache();
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
  invalidateKanjiStrokeReferenceCache();
  setJapaneseDb(null);
  const result = connectJapaneseDbFromCandidates();
  if (result.ready) warmStrokeReferenceCache();
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
  invalidateKanjiStrokeReferenceCache();
  setJapaneseDb(null);
  setJapaneseUserDb(null);
}
