import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import { appSupportDir } from "../persistence";

function isElectronAppReady(): boolean {
  try {
    return Boolean(app?.isPackaged !== undefined);
  } catch {
    return false;
  }
}

function appDataDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  try {
    return app.getPath("appData");
  } catch {
    return join(homedir(), ".config");
  }
}

export function getJapaneseDataDir(): string {
  if (process.env.WORKSPACE_JAPANESE_USER_DATA) {
    return join(process.env.WORKSPACE_JAPANESE_USER_DATA, "japanese");
  }
  return join(appSupportDir(), "japanese");
}

export function getJapaneseDictionaryDbPath(): string {
  return join(getJapaneseDataDir(), "dictionary.db");
}

export function getJapaneseUserDbPath(): string {
  return join(getJapaneseDataDir(), "user.db");
}

export function getJapaneseLogPath(): string {
  if (process.env.WORKSPACE_JAPANESE_USER_DATA) {
    return join(process.env.WORKSPACE_JAPANESE_USER_DATA, "logs", "japanese.ndjson");
  }
  if (!isElectronAppReady()) {
    return join(homedir(), ".config", "workspace-app-dev", "logs", "japanese.ndjson");
  }
  return join(appSupportDir(), "logs", "japanese.ndjson");
}

/** Other locations users/CLI may have written before path unification. */
export function getJapaneseDbCandidatePaths(): string[] {
  if (process.env.WORKSPACE_JAPANESE_USER_DATA) {
    return [join(process.env.WORKSPACE_JAPANESE_USER_DATA, "japanese", "dictionary.db")];
  }

  const primary = getJapaneseDictionaryDbPath();
  const candidates = new Set<string>([primary]);

  // Opposite dev/packaged suffix (common mismatch).
  const packaged = isElectronAppReady() ? app.isPackaged : false;
  const oppositeSuffix = packaged ? "-dev" : "";
  const packagedSuffix = packaged ? "" : "-dev";
  candidates.add(join(appDataDir(), `workspace-app${oppositeSuffix}`, "japanese", "dictionary.db"));
  candidates.add(join(appDataDir(), `workspace-app${packagedSuffix}`, "japanese", "dictionary.db"));

  // Raw Electron userData (no -dev suffix) — legacy mismatch.
  if (isElectronAppReady()) {
    try {
      candidates.add(join(app.getPath("userData"), "japanese", "dictionary.db"));
    } catch {
      // app not ready
    }
  }

  return [...candidates];
}

export interface JapaneseDbPathProbe {
  path: string;
  exists: boolean;
  lexemeCount: number;
  isPrimary: boolean;
  selected: boolean;
}

export function probeJapaneseDbPaths(): JapaneseDbPathProbe[] {
  const primary = getJapaneseDictionaryDbPath();
  const selected = resolveJapaneseDictionaryDbPath();
  return getJapaneseDbCandidatePaths().map((path) => {
    const exists = existsSync(path);
    let lexemeCount = 0;
    if (exists) {
      try {
        const database = new Database(path, { readonly: true, fileMustExist: true });
        try {
          const row = database.prepare("SELECT COUNT(*) AS count FROM lexeme").get() as { count: number };
          lexemeCount = row.count;
        } catch {
          lexemeCount = 0;
        }
        database.close();
      } catch {
        lexemeCount = 0;
      }
    }
    return {
      path,
      exists,
      lexemeCount,
      isPrimary: path === primary,
      selected: path === selected,
    };
  });
}

/** First candidate that exists and has at least one lexeme; else first that exists; else primary. */
export function resolveJapaneseDictionaryDbPath(): string {
  const candidates = getJapaneseDbCandidatePaths();
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const database = new Database(path, { readonly: true, fileMustExist: true });
      try {
        const row = database.prepare("SELECT COUNT(*) AS count FROM lexeme").get() as { count: number };
        if (row.count > 0) {
          database.close();
          return path;
        }
      } catch {
        // not a valid dictionary schema
      }
      database.close();
    } catch {
      // unreadable
    }
  }
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return getJapaneseDictionaryDbPath();
}
