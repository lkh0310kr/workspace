import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { app } from "electron";

// World Engine — Phase 3: Workspace spawns/manages the engine as a
// separate native process (its own real window), the same shape as how
// pty.ts manages a shell — not embedded as a pane. See
// docs/architecture/09-future-native-architecture.md's "World Engine
// build-out" section for why: Phase 2 (true in-process NSView embedding)
// worked, but its input-forwarding follow-up (Phase 4) has no reference
// implementation and is genuinely unsolved — a separate managed window
// has zero input problem at all, since it's a real native window Qt
// handles input for natively. Matches this app's own itch.io-inspired
// precedent for native content (spawn it, track its lifecycle, don't try
// to visually embed).
//
// Dev-only for now: points at the debug build under native/world-engine-
// qt-shell/target/debug/ — packaging the compiled binary via
// electron-builder for a real release is real follow-up work (see the
// doc's Phase 3 note), not attempted here.

// "실제 프로젝트 연동": a directory containing `world-engine.json` (its mere
// presence is what TreeView checks for, matching Godot's project.godot
// precedent) — passed as the process's first CLI arg, which
// world-engine-qt-shell loads instead of its single-cube default demo.
const PROJECT_MARKER_FILE = "world-engine.json";

const runningProcesses = new Set<ChildProcess>();

function resolveWorldEngineBinary(): string | null {
  // app.getAppPath() is this app's `electron/` directory both in dev
  // (electron-vite) and in a packaged build — native/ is a sibling of
  // that at the repo root.
  const candidate = path.join(
    app.getAppPath(),
    "..",
    "native",
    "world-engine-qt-shell",
    "target",
    "debug",
    "world-engine-qt-shell",
  );
  return existsSync(candidate) ? candidate : null;
}

export function isWorldEngineProject(absoluteDirPath: string): boolean {
  return existsSync(path.join(absoluteDirPath, PROJECT_MARKER_FILE));
}

export function worldEngineRunningCount(): number {
  return runningProcesses.size;
}

/** Launches a new World Engine window. `projectPath`, if given, is an
 * absolute directory containing `world-engine.json` — the process loads
 * that scene instead of its single-cube default demo. Each call spawns a
 * new independent window (opening the same project twice just opens two
 * windows) — no single-instance tracking, since different projects are
 * genuinely different windows and there's no cross-process way yet to
 * bring an existing one to the front instead. */
export function launchWorldEngine(projectPath?: string): { ok: boolean; error?: string } {
  const binary = resolveWorldEngineBinary();
  if (!binary) {
    return {
      ok: false,
      error:
        "world-engine-qt-shell binary not found — build it first: cd native/world-engine-qt-shell && cargo build",
    };
  }

  const args = projectPath ? [projectPath] : [];
  const child = spawn(binary, args, { stdio: "ignore" });
  const forget = (): void => {
    runningProcesses.delete(child);
  };
  child.on("exit", forget);
  child.on("error", forget);
  runningProcesses.add(child);
  return { ok: true };
}

/** App-quit cleanup — native windows left running detached from a quit
 * Workspace would be confusing (unlike the terminal's own tmux-less PTYs,
 * which intentionally die with the app too — see pty.ts). */
export function disposeWorldEngine(): void {
  for (const child of runningProcesses) child.kill();
  runningProcesses.clear();
}
