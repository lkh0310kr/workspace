import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";

const USER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS srs_card (
  ent_seq INTEGER PRIMARY KEY,
  due TEXT NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 0,
  ease REAL NOT NULL DEFAULT 2.5,
  repetitions INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS practice_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  literal TEXT NOT NULL,
  score REAL NOT NULL,
  practiced_at TEXT NOT NULL
);
`;

let userDb: Database.Database | null = null;

export function getJapaneseUserDbPath(): string {
  const base = app?.getPath?.("userData") ?? process.env.WORKSPACE_JAPANESE_USER_DATA;
  if (!base) {
    throw new Error("Japanese user DB path unavailable outside Electron (set WORKSPACE_JAPANESE_USER_DATA)");
  }
  return join(base, "japanese", "user.db");
}

export function openJapaneseUserDb(path = getJapaneseUserDbPath()): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.exec(USER_SCHEMA_SQL);
  return database;
}

export function getJapaneseUserDb(): Database.Database {
  if (!userDb) {
    userDb = openJapaneseUserDb();
  }
  return userDb;
}

export function setJapaneseUserDb(database: Database.Database | null): void {
  if (userDb && userDb !== database) {
    try {
      userDb.close();
    } catch {
      // ignore
    }
  }
  userDb = database;
}
