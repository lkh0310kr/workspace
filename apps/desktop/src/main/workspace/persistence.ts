import { app } from 'electron'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { WorkspaceState } from './workspace'
import type { TerminalSessionBuffersFile } from '@workspace/terminal/shared'
import type { UsageMeterSettings } from '../../shared/usage-meter-settings'
import { isPackagedApp } from '../startupLog'

// Port of src/lib.rs's config_path()/workspace_snapshot_path() and their
// load/save helpers.
//
// Existing user data is stored in `workspace-app(-dev)` directories. Keep
// these legacy paths so Desktop upgrades reuse existing settings and layouts.
export function appSupportDir(): string {
  const suffix = isPackagedApp() ? '' : '-dev'
  const name = `workspace-app${suffix}`
  // macOS: retain the existing support path for installed Desktop profiles.
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', name)
  }
  // Windows and Linux use the same legacy profile basename.
  // (Avoid inventing a fake ~/Library tree on non-Mac hosts.)
  return path.join(app.getPath('appData'), name)
}

function configPath(): string {
  return path.join(appSupportDir(), 'config.electron.json')
}

function workspaceSnapshotPath(): string {
  return path.join(appSupportDir(), 'workspace.electron.json')
}

function terminalSessionBuffersPath(): string {
  return path.join(appSupportDir(), 'terminal-sessions.electron.json')
}

export interface AppConfig {
  rootPath?: string
  usageMeters?: UsageMeterSettings
}

export function loadConfig(): AppConfig {
  try {
    const { japaneseStudy: _legacyJapaneseStudy, ...config } = JSON.parse(
      fs.readFileSync(configPath(), 'utf8')
    )
    return config
  } catch {
    return {}
  }
}

export function saveConfig(config: AppConfig): void {
  const p = configPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(config, null, 2))
}

export function loadWorkspaceSnapshot(): WorkspaceState | null {
  try {
    return JSON.parse(fs.readFileSync(workspaceSnapshotPath(), 'utf8'))
  } catch {
    return null
  }
}

export function saveWorkspaceSnapshot(snapshot: WorkspaceState): void {
  try {
    const p = workspaceSnapshotPath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(snapshot, null, 2))
  } catch {
    // Best-effort, same as the Rust version (logs and moves on rather
    // than failing the action that triggered the save).
  }
}

export function loadTerminalSessionBuffers(): TerminalSessionBuffersFile {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(terminalSessionBuffersPath(), 'utf8')
    ) as TerminalSessionBuffersFile
    if (parsed && typeof parsed === 'object' && parsed.buffersByTerminalId) {
      return parsed
    }
  } catch {
    /* missing or corrupt */
  }
  return { buffersByTerminalId: {} }
}

export function saveTerminalSessionBuffers(file: TerminalSessionBuffersFile): void {
  try {
    const p = terminalSessionBuffersPath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(file, null, 2))
  } catch {
    /* best-effort */
  }
}

export function clearTerminalSessionBuffers(): void {
  try {
    fs.unlinkSync(terminalSessionBuffersPath())
  } catch {
    /* already absent */
  }
}
