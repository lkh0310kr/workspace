#!/usr/bin/env node
/**
 * Launch with IBus env + Orca-style hangul bootstrap before Electron starts.
 *
 * Usage: node scripts/with-linux-ime.mjs <cmd> [args...]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { applyLinuxImeEnv, bootstrapLinuxIme } from "./linux-ime-bootstrap.mjs";
import { applyWslGpuEnv } from "./wsl-gpu-env.mjs";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: with-linux-ime.mjs <command> [args...]");
  process.exit(1);
}

const cmd = args[0];
const cmdArgs = args.slice(1);
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform === "linux") {
  await bootstrapLinuxIme();
}

const child = spawn(cmd, cmdArgs, {
  stdio: "inherit",
  env: applyWslGpuEnv(applyLinuxImeEnv()),
  cwd,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
