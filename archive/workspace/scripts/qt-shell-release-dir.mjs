#!/usr/bin/env node
/**
 * Resolve world-engine-qt-shell release output directory.
 * Workspace members build to <repo>/target/release; standalone qt-shell builds
 * to world-engine/qt-shell/target/release.
 */
import fs from "node:fs";
import path from "node:path";

const EXE = "world-engine-qt-shell.exe";

export function qtShellReleaseDirCandidates(repoRoot) {
  return [
    path.join(repoRoot, "target", "release"),
    path.join(repoRoot, "world-engine", "qt-shell", "target", "release"),
  ];
}

export function resolveQtShellReleaseDir(repoRoot) {
  for (const dir of qtShellReleaseDirCandidates(repoRoot)) {
    if (fs.existsSync(path.join(dir, EXE))) return dir;
  }
  return null;
}
