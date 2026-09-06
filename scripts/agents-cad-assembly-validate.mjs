#!/usr/bin/env node
/**
 * Rebuild a CAD project assembly and run validate + interfere + layout contract.
 *
 * Usage: node scripts/agents-cad-assembly-validate.mjs models/mulle-bangah
 */
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runOrExit, venvExists, venvPython } from "./agents-python-lib.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const projectArg = process.argv[2];
if (!projectArg) {
  console.error("Usage: agents-cad-assembly-validate.mjs <project-dir-under-models>");
  process.exit(2);
}

const PROJECT = join(ROOT, projectArg.startsWith("models/") ? projectArg : `models/${projectArg}`);
const SRC = join(PROJECT, "src");
const ASSEMBLY_PY = join(SRC, "assembly.py");
const ASSEMBLY_STEP = join(PROJECT, "STEP", "assembly.step");
const CONTRACT_PY = join(SRC, "lib", "assembly_validate.py");

if (!venvExists()) {
  console.error("Run first: npm run agents:python:setup");
  process.exit(1);
}
if (!existsSync(ASSEMBLY_PY)) {
  console.error(`Missing ${ASSEMBLY_PY}`);
  process.exit(1);
}

const vpy = venvPython();
const t0 = performance.now();

console.log(`Rebuilding ${ASSEMBLY_PY}…`);
runOrExit(vpy, [ASSEMBLY_PY, "--force"], { cwd: SRC });

if (!existsSync(ASSEMBLY_STEP)) {
  console.error(`Expected output missing: ${ASSEMBLY_STEP}`);
  process.exit(1);
}

console.log("validate…");
runOrExit(
  vpy,
  ["-m", "cadgen.cli", "step", "inspect", "validate", ASSEMBLY_STEP, "--format", "json"],
  { cwd: ROOT },
);

console.log("interfere…");
runOrExit(
  vpy,
  [
    "-m",
    "cadgen.cli",
    "step",
    "inspect",
    "interfere",
    ASSEMBLY_STEP,
    "--format",
    "json",
    "--tolerance",
    "500",
  ],
  { cwd: ROOT },
);

if (existsSync(CONTRACT_PY)) {
  console.log("layout contract…");
  runOrExit(vpy, [CONTRACT_PY], { cwd: SRC });
} else {
  console.warn(`No ${CONTRACT_PY} — skipping layout contract`);
}

const elapsed = Math.round(performance.now() - t0);
console.log(`\nOK — assembly validation passed (${elapsed} ms)`);
console.log(ASSEMBLY_STEP);
