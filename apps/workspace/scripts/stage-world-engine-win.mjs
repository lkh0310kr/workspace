#!/usr/bin/env node
/**
 * Stage world-engine-qt-shell release artifacts for electron-builder extraResources.
 * Skips gracefully when the Windows/Qt build has not been run yet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveQtShellReleaseDir } from "./qt-shell-release-dir.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(electronDir, "..", "..");
const stageDir = path.join(electronDir, "resources", "world-engine");
const sourceDir = resolveQtShellReleaseDir(repoRoot);

const EXE = "world-engine-qt-shell.exe";
const COPY_GLOBS = [
  EXE,
  /^Qt6.*\.dll$/i,
  /^opengl32sw\.dll$/i,
  /^D3Dcompiler.*\.dll$/i,
];

function shouldCopy(name) {
  if (COPY_GLOBS.some((g) => (typeof g === "string" ? name === g : g.test(name)))) return true;
  return ["platforms", "styles", "imageformats", "iconengines", "tls", "translations"].includes(name);
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!shouldCopy(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

if (!sourceDir) {
  const expected = path.join(repoRoot, "target", "release", EXE);
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(
    path.join(stageDir, "README.txt"),
    "world-engine-qt-shell.exe not built yet.\r\n" +
      "On Windows: world-engine\\qt-shell\\scripts\\build-windows.ps1 -Release\r\n",
  );
  console.warn(
    `[stage-world-engine-win] Skip — ${expected} not found (wrote ${stageDir}/README.txt).`,
  );
  process.exit(0);
}

const exePath = path.join(sourceDir, EXE);

if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
copyTree(sourceDir, stageDir);
console.log(`[stage-world-engine-win] Staged ${stageDir}`);
