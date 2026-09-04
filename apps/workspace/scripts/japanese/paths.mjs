import { homedir } from "node:os";
import { join } from "node:path";

/** Mirrors apps/workspace/src/main/persistence.ts appSupportDir naming. */
export function appSupportDir({ packaged = false } = {}) {
  const suffix = packaged ? "" : "-dev";
  const name = `workspace-app${suffix}`;
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", name);
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, name);
  }
  return join(homedir(), ".config", name);
}

export function defaultDictionaryDbPath(options = {}) {
  return join(appSupportDir(options), "japanese", "dictionary.db");
}
