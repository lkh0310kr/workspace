#!/usr/bin/env node
/**
 * Stop stale electron-vite / Electron processes for this repo before `npm run dev`.
 * electron-vite calls process.exit when its Electron child exits; a leftover
 * instance holding requestSingleInstanceLock makes the new child quit instantly.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronPattern = process.platform === "darwin"
  ? `${root}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`
  : `${root}/node_modules/electron/dist/electron`;
const patterns = [electronPattern, `${root}/node_modules/.bin/electron-vite`];

function signalMatches(pattern, signal) {
  try {
    execFileSync("pkill", [`-${signal}`, "-f", pattern], { stdio: "ignore" });
  } catch {
    /* No matching process. */
  }
}

function hasMatches(pattern) {
  try {
    execFileSync("pgrep", ["-f", pattern], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

for (const pattern of patterns) signalMatches(pattern, "TERM");
await new Promise((resolve) => setTimeout(resolve, 1_000));
for (const pattern of patterns) {
  if (hasMatches(pattern)) signalMatches(pattern, "KILL");
}
