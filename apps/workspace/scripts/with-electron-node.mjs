#!/usr/bin/env node
/**
 * Run a script with Electron's Node.js (same ABI as the desktop app).
 * Required for CLI tools that load better-sqlite3 after electron-rebuild.
 *
 * Usage: node scripts/with-electron-node.mjs <script.mjs> [args...]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(scriptDir, "..");
const electronBin = path.join(
  electronDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: with-electron-node.mjs <script> [args...]");
  process.exit(1);
}

const result = spawnSync(electronBin, args, {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  cwd: electronDir,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
