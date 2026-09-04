import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getSchemaSql } from "./schema";
import { getJapaneseDictionaryDbPath, resolveJapaneseDictionaryDbPath } from "./paths";
import { japaneseLog } from "./japaneseLog";

let db: Database.Database | null = null;
let loadedDbPath: string | null = null;
let lastConnectError: string | null = null;

export function getLastJapaneseDbConnectError(): string | null {
  return lastConnectError;
}

export function getJapaneseDbPath(): string {
  return getJapaneseDictionaryDbPath();
}

export function getLoadedJapaneseDbPath(): string | null {
  return loadedDbPath;
}

export function openJapaneseDb(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  japaneseLog("db_open", { path });
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  runJapaneseDbMigrations(database);
  return database;
}

function runJapaneseDbMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sense_pos (
      sense_id INTEGER NOT NULL REFERENCES sense(id) ON DELETE CASCADE,
      pos TEXT NOT NULL,
      PRIMARY KEY (sense_id, pos)
    );
    CREATE INDEX IF NOT EXISTS idx_sense_pos_sense_id ON sense_pos(sense_id);
  `);
}

export function initJapaneseSchema(database: Database.Database): void {
  database.exec(getSchemaSql());
}

function dictionaryHasLexemeTable(database: Database.Database): boolean {
  try {
    const row = database
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'lexeme' LIMIT 1")
      .get() as { ok: number } | undefined;
    return row !== undefined;
  } catch {
    return false;
  }
}

export function getJapaneseDb(): Database.Database | null {
  return db;
}

export function setJapaneseDb(database: Database.Database | null, path?: string | null): void {
  if (db && db !== database) {
    try {
      db.close();
      japaneseLog("db_close", { path: loadedDbPath });
    } catch (err) {
      japaneseLog("db_close_error", { path: loadedDbPath, error: String(err) });
    }
  }
  db = database;
  if (database) {
    if (path) loadedDbPath = path;
  } else {
    loadedDbPath = null;
  }
}

export function connectJapaneseDbAt(path: string): boolean {
  if (!existsSync(path)) {
    japaneseLog("db_missing", { path });
    setJapaneseDb(null);
    loadedDbPath = null;
    return false;
  }
  try {
    const database = openJapaneseDb(path);
    if (!dictionaryHasLexemeTable(database)) {
      initJapaneseSchema(database);
    }
    setJapaneseDb(database, path);
    loadedDbPath = path;
    const count = getLexemeCount();
    lastConnectError = null;
    japaneseLog("db_connected", { path, lexemeCount: count });
    return count > 0;
  } catch (err) {
    lastConnectError = err instanceof Error ? err.message : String(err);
    japaneseLog("db_connect_error", { path, error: lastConnectError });
    setJapaneseDb(null);
    loadedDbPath = null;
    return false;
  }
}

export function connectJapaneseDbFromCandidates(): { path: string; ready: boolean } {
  const resolved = resolveJapaneseDictionaryDbPath();
  const ready = connectJapaneseDbAt(resolved);
  if (!ready && existsSync(resolved)) {
    if (lastConnectError) {
      japaneseLog("db_connect_failed", { path: resolved, error: lastConnectError });
    } else {
      japaneseLog("db_empty", { path: resolved, hint: "file exists but lexeme table is empty — re-run import" });
    }
  }
  return { path: resolved, ready };
}

export function isJapaneseDbReady(): boolean {
  if (!db) return false;
  try {
    const row = db.prepare("SELECT COUNT(*) AS count FROM lexeme").get() as { count: number };
    return row.count > 0;
  } catch {
    return false;
  }
}

export function getLexemeCount(): number {
  if (!db) return 0;
  try {
    const row = db.prepare("SELECT COUNT(*) AS count FROM lexeme").get() as { count: number };
    return row.count;
  } catch {
    return 0;
  }
}

export function getKanjiCount(): number {
  if (!db) return 0;
  try {
    const row = db.prepare("SELECT COUNT(*) AS count FROM kanji").get() as { count: number };
    return row.count;
  } catch {
    return 0;
  }
}

export function getStrokeKanjiCount(): number {
  if (!db) return 0;
  try {
    const row = db.prepare("SELECT COUNT(DISTINCT literal) AS count FROM kanji_stroke").get() as {
      count: number;
    };
    return row.count;
  } catch {
    return 0;
  }
}

export function getMetaValue(key: string): string | null {
  if (!db) return null;
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}
