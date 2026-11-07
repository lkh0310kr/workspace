#!/usr/bin/env node
/**
 * B7 bench: rebuild pottery-wheel assembly and print timing JSON.
 */
import { existsSync, statSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runOrExit, venvExists, venvPython } from "./agents-python-lib.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "models", "pottery-wheel", "src");
const ASSEMBLY = join(SRC, "assembly.py");
const ASSEMBLY_STEP = join(ROOT, "models", "pottery-wheel", "STEP", "assembly.step");

if (!venvExists()) {
  console.error("Run first: npm run agents:python:setup");
  process.exit(1);
}

const vpy = venvPython();
const before = existsSync(ASSEMBLY_STEP) ? statSync(ASSEMBLY_STEP) : null;

const buildStart = performance.now();
runOrExit(vpy, [ASSEMBLY], { cwd: SRC });
const buildMs = Math.round(performance.now() - buildStart);

if (!existsSync(ASSEMBLY_STEP)) {
  console.error(`Expected output missing: ${ASSEMBLY_STEP}`);
  process.exit(1);
}

const after = statSync(ASSEMBLY_STEP);
const validateStart = performance.now();
runOrExit(vpy, ["-m", "cadgen.cli", "step", "inspect", "validate", ASSEMBLY_STEP]);
const validateMs = Math.round(performance.now() - validateStart);

const report = {
  phase: "B7",
  build_ms: buildMs,
  validate_ms: validateMs,
  step_kb: Math.round(after.size / 1024),
  step_changed: !before || before.mtimeMs !== after.mtimeMs || before.size !== after.size,
  outputs: {
    assembly: "models/pottery-wheel/STEP/assembly.step",
    dims: "models/pottery-wheel/src/lib/dims.py",
  },
  viewer_hint:
    "With assembly.step open, saving a rebuild should trigger fs:changed → STEP→glb convert → soft reload.",
};

console.log(JSON.stringify(report, null, 2));
console.log(`\nOK — rebuilt ${ASSEMBLY_STEP} (${report.step_kb} KB, ${report.build_ms} ms build)`);
