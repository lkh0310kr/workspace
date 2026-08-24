import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkspaceState } from "./workspace";

// Port of src/lib.rs's config_path()/workspace_snapshot_path() and their
// load/save helpers.
//
// Deliberately *not* sharing the Tauri app's actual `config.json`/
// `workspace.json` filenames, even though both live under the same
// `~/Library/Application Support/workspace-app` directory (see pty.ts's
// tmux.conf, which *is* intentionally shared — its content is identical
// either way). This Electron build and the Tauri app are both runnable
// during the migration; using distinct filenames means running one can't
// corrupt or fight over the other's actual persisted tabs/settings. Once
// this replaces the Tauri app outright, these can be renamed to match.
function appSupportDir(): string {
  return path.join(os.homedir(), "Library", "Application Support", "workspace-app");
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
