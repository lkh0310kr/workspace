import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { app } from "electron";
import { isWsl, wslPathToWindows } from "./wslPaths";

// World Engine — Workspace spawns `world-engine-qt-shell` as a child process
// (see docs/architecture/09-future-native-architecture.md). Packaged Windows
// builds bundle the release `.exe` under `resources/world-engine/`.

const PROJECT_MARKER_FILE = "world-engine.json";
const PACKAGED_WORLD_ENGINE_DIR = "world-engine";

const runningProcesses = new Set<ChildProcess>();

export type WorldEngineBinaryOptions = {
  appPath?: string;
  platform?: NodeJS.Platform;
  wsl?: boolean;
  packaged?: boolean;
  resourcesPath?: string;
};

function isPackagedApp(): boolean {
  try {
    return app.isPackaged;
  } catch {
    return false;
  }
}

function resourcesPath(): string {
  try {
    return process.resourcesPath;
  } catch {
    return "";
  }
}

function appPath(): string {
  try {
    return app.getAppPath();
  } catch {
    return "";
  }
}

function binaryBasenames(platform: NodeJS.Platform, wsl: boolean): string[] {
  return platform === "win32" || wsl
    ? ["world-engine-qt-shell.exe", "world-engine-qt-shell"]
    : ["world-engine-qt-shell"];
}

/** Candidate binary paths (packaged release, then dev release/debug) — exported for tests. */
export function worldEngineBinaryCandidates(options: WorldEngineBinaryOptions = {}): string[] {
  const platform = options.platform ?? process.platform;
  const wsl = options.wsl ?? isWsl();
  const packaged = options.packaged ?? isPackagedApp();
  const resources = options.resourcesPath ?? resourcesPath();
  const electronAppPath = options.appPath ?? appPath();

  const out: string[] = [];
  if (packaged && resources) {
    const packagedDir = path.join(resources, PACKAGED_WORLD_ENGINE_DIR);
    for (const name of binaryBasenames(platform, wsl)) {
      out.push(path.join(packagedDir, name));
    }
  }
  if (electronAppPath) {
    const base = path.join(electronAppPath, "..", "..", "world-engine", "qt-shell", "target");
    for (const profile of ["release", "debug"]) {
      for (const name of binaryBasenames(platform, wsl)) {
        out.push(path.join(base, profile, name));
      }
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

function spawnOptionsForBinary(binary: string): Pick<SpawnOptions, "cwd" | "env"> {
  // Packaged Windows: Qt DLLs from windeployqt live next to the .exe.
  if (process.platform === "win32" || (isWsl() && binary.endsWith(".exe"))) {
    return { cwd: path.dirname(binary), env: process.env };
  }
  return { env: process.env };
}

function launchGuiProcess(
  binary: string,
  args: string[],
): Promise<{ ok: boolean; error?: string }> {
  const useWindowsHost = isWsl() && binary.endsWith(".exe");
  if (useWindowsHost) {
    const winBinary = wslPathToWindows(binary);
    if (!winBinary) {
      return Promise.resolve({
        ok: false,
        error: `Cannot map World Engine path for Windows: ${binary}`,
      });
    }
    const winArgs = args.map((arg) => wslPathToWindows(arg) ?? arg);
    const winCwd = wslPathToWindows(path.dirname(binary)) ?? "";
    return new Promise((resolve) => {
      const cmdArgs = ["/c", "start", "", "/D", winCwd ?? "", winBinary, ...winArgs];
      const child = spawn("cmd.exe", cmdArgs, { stdio: "ignore", windowsHide: true, detached: true });
      child.once("error", (err) => resolve({ ok: false, error: err.message }));
      child.once("spawn", () => {
        child.unref();
        resolve({ ok: true });
      });
    });
  }

  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      stdio: "ignore",
      windowsHide: false,
      detached: true,
      ...spawnOptionsForBinary(binary),
    });
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

function buildHint(): string {
  if (isWsl()) {
    return (
      "On WSL, build the Windows .exe on the Windows host:\n" +
      "  cd world-engine\\qt-shell && .\\scripts\\build-windows.ps1 -Release\n" +
      "See docs/windows-build.md"
    );
  }
  if (process.platform === "win32") {
    return "Install Qt 6 MSVC, then: cd world-engine\\qt-shell && .\\scripts\\build-windows.ps1 -Release\nSee docs/windows-build.md";
  }
  if (process.platform === "darwin") {
    return "brew install qt, then: cd world-engine/qt-shell && cargo build";
  }
  return "Install Qt 6 (qt6-base-dev), then: cd world-engine/qt-shell && cargo build";
}

/** Launches a new World Engine window. `projectPath` is an absolute directory
 * containing `world-engine.json`, or omitted for the default demo scene. */
export async function launchWorldEngine(
  projectPath?: string,
): Promise<{ ok: boolean; error?: string }> {
  const binary = resolveWorldEngineBinary();
  if (!binary) {
    const searched = worldEngineBinaryCandidates().join("\n  ");
    return {
      ok: false,
      error: `world-engine-qt-shell binary not found.\nSearched:\n  ${searched}\n\n${buildHint()}`,
    };
  }

  const args = projectPath ? [projectPath] : [];
  return launchGuiProcess(binary, args);
}

export function disposeWorldEngine(): void {
  for (const child of runningProcesses) child.kill();
  runningProcesses.clear();
}
