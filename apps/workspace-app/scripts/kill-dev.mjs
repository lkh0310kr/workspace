#!/usr/bin/env node
/**
 * Stop stale electron-vite / Electron processes for this repo before `npm run dev`.
 * electron-vite calls process.exit when its Electron child exits; a leftover
 * instance holding requestSingleInstanceLock makes the new child quit instantly.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pattern = `${root}/node_modules`;

try {
  execSync(`pkill -9 -f '${pattern}/electron/dist/electron'`, { stdio: "ignore" });
} catch {
  /* none running */
}
try {
  execSync(`pkill -9 -f '${pattern}/.bin/electron-vite'`, { stdio: "ignore" });
} catch {
  /* none running */
}
