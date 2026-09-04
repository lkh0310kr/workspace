import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getJapaneseUserDbPath } from "./paths";
import { japaneseLog } from "./japaneseLog";

const USER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS practice_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  literal TEXT NOT NULL,
  score REAL NOT NULL,
  practiced_at TEXT NOT NULL
);
`;

let userDb: Database.Database | null = null;

export function openJapaneseUserDb(path = getJapaneseUserDbPath()): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  japaneseLog("user_db_open", { path });
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
