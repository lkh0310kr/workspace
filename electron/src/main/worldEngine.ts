import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { app } from "electron";
import { isWsl, wslPathToWindows } from "./wslPaths";

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

function binaryBasenames(platform: NodeJS.Platform = process.platform, wsl: boolean = isWsl()): string[] {
  return platform === "win32" || wsl
    ? ["world-engine-qt-shell.exe", "world-engine-qt-shell"]
    : ["world-engine-qt-shell"];
}

/** Candidate binary paths (debug then release) — exported for tests. */
export function worldEngineBinaryCandidates(
  appPath: string = app.getAppPath(),
  platform: NodeJS.Platform = process.platform,
  wsl: boolean = isWsl(),
): string[] {
  const base = path.join(appPath, "..", "native", "world-engine-qt-shell", "target");
  const out: string[] = [];
  for (const profile of ["debug", "release"]) {
    for (const name of binaryBasenames(platform, wsl)) {
      out.push(path.join(base, profile, name));
    }
  }
  return out;
}

function resolveWorldEngineBinary(): string | null {
  for (const candidate of worldEngineBinaryCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function isWorldEngineProject(absoluteDirPath: string): boolean {
  return existsSync(path.join(absoluteDirPath, PROJECT_MARKER_FILE));
}

export function worldEngineRunningCount(): number {
  return runningProcesses.size;
}

function trackChild(child: ChildProcess): void {
  const forget = (): void => {
    runningProcesses.delete(child);
  };
  child.on("exit", forget);
  child.on("error", forget);
  runningProcesses.add(child);
}

function launchGuiProcess(
  binary: string,
  args: string[],
): Promise<{ ok: boolean; error?: string }> {
  const useWindowsHost = isWsl() && binary.endsWith(".exe");
  if (useWindowsHost) {
    const winBinary = wslPathToWindows(binary) ?? binary;
    const winArgs = args.map((arg) => wslPathToWindows(arg) ?? arg);
    return new Promise((resolve) => {
      const cmdArgs = ["/c", "start", "", winBinary, ...winArgs];
      const child = spawn("cmd.exe", cmdArgs, { stdio: "ignore", windowsHide: true, detached: true });
      child.once("error", (err) => resolve({ ok: false, error: err.message }));
      child.once("spawn", () => {
        child.unref();
        resolve({ ok: true });
      });
    });
  }

  return new Promise((resolve) => {
    const child = spawn(binary, args, { stdio: "ignore", windowsHide: false, detached: true });
    const onError = (err: Error): void => {
      runningProcesses.delete(child);
      resolve({ ok: false, error: err.message });
    };
    child.once("error", onError);
    child.once("spawn", () => {
      child.off("error", onError);
      child.unref();
      trackChild(child);
      resolve({ ok: true });
    });
  });
}

/** Launches a new World Engine window. `projectPath`, if given, is an
 * absolute directory containing `world-engine.json` — the process loads
 * that scene instead of its single-cube default demo. Each call spawns a
 * new independent window (opening the same project twice just opens two
 * windows) — no single-instance tracking, since different projects are
 * genuinely different windows and there's no cross-process way yet to
 * bring an existing one to the front instead. */
export async function launchWorldEngine(
  projectPath?: string,
): Promise<{ ok: boolean; error?: string }> {
  const binary = resolveWorldEngineBinary();
  if (!binary) {
    const searched = worldEngineBinaryCandidates().join("\n  ");
    const wsl = isWsl();
    const hint = wsl
      ? "On WSL, build the Windows .exe (Qt + Rust on Windows): cd native\\world-engine-qt-shell && cargo build. Linux cargo build here fails until build.rs supports Linux Qt."
      : process.platform === "win32"
        ? "Install Qt 6, then: cd native\\world-engine-qt-shell && cargo build"
        : "On macOS: brew install qt, then cd native/world-engine-qt-shell && cargo build";
    return {
      ok: false,
      error: `world-engine-qt-shell binary not found.\nSearched:\n  ${searched}\n\n${hint}`,
    };
  }

  const args = projectPath ? [projectPath] : [];
  return launchGuiProcess(binary, args);
}

/** App-quit cleanup — native windows left running detached from a quit
 * Workspace would be confusing (unlike the terminal's own tmux-less PTYs,
 * which intentionally die with the app too — see pty.ts). */
export function disposeWorldEngine(): void {
  for (const child of runningProcesses) child.kill();
  runningProcesses.clear();
}
