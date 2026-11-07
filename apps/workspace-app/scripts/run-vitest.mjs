#!/usr/bin/env node
/**
 * Run vitest with correct better-sqlite3 ABI, then restore Electron build.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: electronDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

run("node", ["scripts/rebuild-better-sqlite3.mjs"]);
const code = run("npx", ["vitest", "run"]);
run("node", ["scripts/rebuild-better-sqlite3.mjs", "--electron"]);
process.exit(code);
