import { app } from "electron";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkspaceState } from "./workspace";

// Port of src/lib.rs's config_path()/workspace_snapshot_path() and their
// load/save helpers.
//
// Deliberately *not* sharing the Tauri app's actual `config.json`/
// `workspace.json` filenames, even though both live under the same
// `~/Library/Application Support/workspace-app` directory on macOS. This
// Electron build and the Tauri app are both runnable during the migration;
// using distinct filenames means running one can't corrupt or fight over
// the other's actual persisted tabs/settings. Once this replaces the Tauri
// app outright, these can be renamed to match.
//
// `npm run dev` gets its own suffixed directory (`workspace-app-dev`),
// separate from a packaged/installed build's `workspace-app`. Without
// this, iterating with `npm run dev` while daily-driving a packaged build
// (or accidentally launching `npm run dev` twice) means both processes
// read/write the exact same config.electron.json/workspace.electron.json
// with no locking — last writer wins, in-memory PTY/tab state diverges
// from what's on disk, and the surviving window can end up stuck at
// "Loading workspace…" forever. See also requestSingleInstanceLock in
// index.ts, which guards the same failure mode for a literal double
// launch within the same (dev or packaged) build.
export function appSupportDir(): string {
  const suffix = app.isPackaged ? "" : "-dev";
  const name = `workspace-app${suffix}`;
  // macOS: keep the Tauri-compatible Library path so existing Mac installs
  // and dual-running during migration stay untouched.
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", name);
  }
  // Windows → %APPDATA%\workspace-app(-dev)
  // Linux/WSL → ~/.config/workspace-app(-dev)
  // (Avoid inventing a fake ~/Library tree on non-Mac hosts.)
  return path.join(app.getPath("appData"), name);
}

/** Legacy Mac-style path that early Linux/WSL builds accidentally used. */
function legacyLibraryAppSupportDir(suffix: string): string {
  return path.join(os.homedir(), "Library", "Application Support", `workspace-app${suffix}`);
}

function copyStateFilesIfMissing(fromDir: string, toDir: string): void {
  for (const file of ["config.electron.json", "workspace.electron.json"]) {
    const from = path.join(fromDir, file);
    const to = path.join(toDir, file);
    if (!fs.existsSync(from) || fs.existsSync(to)) continue;
    fs.mkdirSync(toDir, { recursive: true });
    fs.copyFileSync(from, to);
  }
}

/**
 * One-time migration for the appSupportDir dev/packaged split above: dev
 * used to write straight into the shared (now packaged-only) directory.
 * Copies config.electron.json/workspace.electron.json into the new
 * `-dev` directory on first run after the split, so a dev session that
 * was already someone's daily driver doesn't appear to lose its tabs.
 * Copy, not move — the legacy files stay in place for a packaged build
 * to pick up too. Only fires if the dev-side file doesn't exist yet, so
 * it never clobbers state the dev directory has since diverged with.
 *
 * On Windows/Linux also migrates off the accidental `~/Library/...` path
 * used before appSupportDir became platform-aware.
 */
export function migrateLegacyDevStateIfNeeded(): void {
  const dest = appSupportDir();

  if (!app.isPackaged) {
    // Packaged → dev split (Mac-shaped Library dirs, and any host that still
    // has them from an older build).
    const legacyPackagedLibrary = legacyLibraryAppSupportDir("");
    if (dest !== legacyPackagedLibrary) {
      copyStateFilesIfMissing(legacyPackagedLibrary, dest);
    }
  }

  if (process.platform !== "darwin") {
    const suffix = app.isPackaged ? "" : "-dev";
    const accidentalLibrary = legacyLibraryAppSupportDir(suffix);
    if (dest !== accidentalLibrary) {
      copyStateFilesIfMissing(accidentalLibrary, dest);
    }
  }
}

function configPath(): string {
  return path.join(appSupportDir(), "config.electron.json");
}

function workspaceSnapshotPath(): string {
  return path.join(appSupportDir(), "workspace.electron.json");
}

export interface AppConfig {
  rootPath?: string;
}

export function loadConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(config: AppConfig): void {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2));
}

export function loadWorkspaceSnapshot(): WorkspaceState | null {
  try {
    return JSON.parse(fs.readFileSync(workspaceSnapshotPath(), "utf8"));
  } catch {
    return null;
  }
}

export function saveWorkspaceSnapshot(snapshot: WorkspaceState): void {
  try {
    const p = workspaceSnapshotPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(snapshot, null, 2));
  } catch {
    // Best-effort, same as the Rust version (logs and moves on rather
    // than failing the action that triggered the save).
  }
}
