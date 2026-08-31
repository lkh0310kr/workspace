#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for system Node (vitest/CLI) or Electron (app runtime).
 *
 * Modes:
 *   (default)     rebuild for system Node when the current binary does not load
 *   --electron    force electron-rebuild (app / import scripts)
 *   --ensure-electron  rebuild only when Electron cannot load better-sqlite3 (predev)
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const forElectron = process.argv.includes("--electron");
const ensureElectron = process.argv.includes("--ensure-electron");
const electronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const electronBin = path.join(
  electronDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: electronDir,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function systemNodeSqliteWorks() {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    return true;
  } catch {
    return false;
  }
}

function electronSqliteWorks() {
  const result = spawnSync(
    electronBin,
    ["-e", "require('better-sqlite3')(':memory:').close()"],
    {
      cwd: electronDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: "pipe",
    },
  );
  return result.status === 0;
}

function signNativeAddonsIfNeeded() {
  if (process.platform !== "darwin") return;
  run("node", ["scripts/sign-native-addons.mjs"]);
}

function rebuildForElectron() {
  run("npx", ["electron-rebuild", "-f", "-w", "better-sqlite3"]);
  signNativeAddonsIfNeeded();
}

if (forElectron) {
  rebuildForElectron();
} else if (ensureElectron) {
  if (!electronSqliteWorks()) {
    rebuildForElectron();
  } else {
    signNativeAddonsIfNeeded();
  }
} else if (!systemNodeSqliteWorks()) {
  run("npm", ["rebuild", "better-sqlite3"]);
}
