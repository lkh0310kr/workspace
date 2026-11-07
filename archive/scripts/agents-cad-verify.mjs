#!/usr/bin/env node
/**
 * End-to-end smoke test: build models/smoke-test/bracket.step with cadgen.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runOrExit, venvExists, venvPython } from "./agents-python-lib.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SMOKE_DIR = join(ROOT, "models", "smoke-test");
const MODEL = join(SMOKE_DIR, "bracket.py");
const STEP = join(SMOKE_DIR, "bracket.step");

if (!venvExists()) {
  console.error("Run first: npm run agents:python:setup");
  process.exit(1);
}

const vpy = venvPython();
console.log("Building smoke-test bracket…");
runOrExit(vpy, [MODEL], { cwd: SMOKE_DIR });

if (!existsSync(STEP)) {
  console.error(`Expected output missing: ${STEP}`);
  process.exit(1);
}

console.log("Inspecting STEP refs…");
runOrExit(vpy, ["-m", "cadgen.cli", "step", "inspect", "refs", STEP, "--facts"], {
  cwd: SMOKE_DIR,
});

console.log(`\nOK — text-to-cad is runnable. Output: ${STEP}`);
