import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import { getSchemaSql } from "./schema";

let db: Database.Database | null = null;

export function getJapaneseDbPath(): string {
  return joinUserData("japanese", "dictionary.db");
}

function joinUserData(...segments: string[]): string {
  const base = app?.getPath?.("userData") ?? process.env.WORKSPACE_JAPANESE_USER_DATA;
  if (!base) {
    throw new Error("Japanese DB path unavailable outside Electron (set WORKSPACE_JAPANESE_USER_DATA)");
  }
  return join(base, ...segments);
}

export function openJapaneseDb(path = getJapaneseDbPath()): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return database;
}

export function initJapaneseSchema(database: Database.Database): void {
  database.exec(getSchemaSql());
}

export function getJapaneseDb(): Database.Database | null {
  return db;
}

export function setJapaneseDb(database: Database.Database | null): void {
  if (db && db !== database) {
    try {
      db.close();
    } catch {
      // ignore close errors during swap
    }
  }
  db = database;
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
