import { safeStorage } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { appSupportDir } from "../persistence";

let volatileSession: string | null = null;

function sessionPath(): string {
  return path.join(appSupportDir(), "pkms-session.safe");
}

export function readPkmsSession(): string | null {
  if (volatileSession) return volatileSession;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    volatileSession = safeStorage.decryptString(fs.readFileSync(sessionPath()));
    return volatileSession;
  } catch {
    return null;
  }
}

export function writePkmsSession(token: string): void {
  volatileSession = token;
  if (!safeStorage.isEncryptionAvailable()) return;
  const target = sessionPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, safeStorage.encryptString(token), { mode: 0o600 });
}

export function clearPkmsSession(): void {
  volatileSession = null;
  try { fs.rmSync(sessionPath(), { force: true }); } catch { /* best effort */ }
}
