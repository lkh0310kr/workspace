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

let worldEngineProcess: ChildProcess | null = null;

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

export function worldEngineStatus(): "running" | "stopped" {
  return worldEngineProcess && !worldEngineProcess.killed ? "running" : "stopped";
}

/** Launches World Engine as its own native window if it isn't already
 * running. Bringing an already-running instance to the front is left to
 * the OS/user (no window-handle plumbing back from the child process
 * yet) — matches this being a dev-time Phase 3 integration, not full
 * window management. */
export function launchWorldEngine(): { ok: boolean; error?: string } {
  if (worldEngineStatus() === "running") {
    return { ok: true };
  }

  const binary = resolveWorldEngineBinary();
  if (!binary) {
    return {
      ok: false,
      error:
        "world-engine-qt-shell binary not found — build it first: cd native/world-engine-qt-shell && cargo build",
    };
  }

  const child = spawn(binary, [], { stdio: "ignore" });
  child.on("exit", () => {
    if (worldEngineProcess === child) worldEngineProcess = null;
  });
  child.on("error", () => {
    if (worldEngineProcess === child) worldEngineProcess = null;
  });
  worldEngineProcess = child;
  return { ok: true };
}

export function stopWorldEngine(): void {
  worldEngineProcess?.kill();
  worldEngineProcess = null;
}

/** App-quit cleanup — a native window left running detached from a quit
 * Workspace would be confusing (unlike the terminal's own tmux-less PTYs,
 * which intentionally die with the app too — see pty.ts). */
export function disposeWorldEngine(): void {
  stopWorldEngine();
}
