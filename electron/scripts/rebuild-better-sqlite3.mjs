#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for system Node (vitest/CLI) or Electron (app runtime).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const forElectron = process.argv.includes("--electron");
const electronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: electronDir, shell: process.platform === "win32" });
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

if (forElectron) {
  run("npx", ["electron-rebuild", "-f", "-w", "better-sqlite3"]);
} else if (!systemNodeSqliteWorks()) {
  run("npm", ["rebuild", "better-sqlite3"]);
}
