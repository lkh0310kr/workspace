#!/usr/bin/env node
/**
 * Run a command with the agent-skills Python virtualenv.
 * Example: npm run agents:python -- -m cadgen.cli step inspect --help
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { venvExists, venvPython } from "./agents-python-lib.mjs";

function usage() {
  console.log(`Usage: node scripts/agents-python.mjs <python-args...>

Run npm run agents:python:setup first if .agents/.venv is missing.

Examples:
  npm run agents:python -- -m cadgen.cli step inspect --help
  npm run agents:python -- -m playwright install chromium
`);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  usage();
  process.exit(args.length === 0 ? 1 : 0);
}

if (!venvExists()) {
  console.error("Agent Python venv not found. Run: npm run agents:python:setup");
  process.exit(1);
}

const vpy = venvPython();
if (!existsSync(vpy)) {
  console.error(`Missing interpreter: ${vpy}`);
  process.exit(1);
}

const result = spawnSync(vpy, args, { stdio: "inherit", windowsHide: true });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
