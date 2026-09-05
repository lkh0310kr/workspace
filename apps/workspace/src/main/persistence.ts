import { app } from "electron";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { JapaneseStudyConfig } from "../shared/japaneseStudyTypes";
import type { WorkspaceState } from "./workspace";
import { isPackagedApp } from "./startupLog";

// Port of src/lib.rs's config_path()/workspace_snapshot_path() and their
// load/save helpers.
//
// `npm run dev` uses `workspace-app-dev`, separate from a packaged build's
// `workspace-app`, so dev and packaged installs do not fight over the same
// state files.
export function appSupportDir(): string {
  const suffix = isPackagedApp() ? "" : "-dev";
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

function configPath(): string {
  return path.join(appSupportDir(), "config.electron.json");
}

function workspaceSnapshotPath(): string {
  return path.join(appSupportDir(), "workspace.electron.json");
}

export interface AppConfig {
  rootPath?: string;
  japaneseStudy?: JapaneseStudyConfig;
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
