import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { app, type BrowserWindow } from "electron";

// Phase 2B — experimental in-pane embed (direct wgpu, not WebRTC/stream-poc).
// qt-shell separate window remains the default; see worldEngine.ts.

type EmbedAddon = {
  startEmbeddedEngine: (handle: Buffer, width: number, height: number) => void;
};

export type WorldEngineEmbedModuleOptions = {
  appPath?: string;
  platform?: NodeJS.Platform;
  packaged?: boolean;
  resourcesPath?: string;
};

const PACKAGED_EMBED_DIR = "world-engine-embed";

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

function moduleBasenames(platform: NodeJS.Platform): string[] {
  return platform === "win32"
    ? ["world_engine_electron_embed.node", "world_engine_electron_embed.dll"]
    : ["world_engine_electron_embed.node", "libworld_engine_electron_embed.dylib"];
}

/** Candidate native addon paths — exported for tests. */
export function worldEngineEmbedModuleCandidates(
  options: WorldEngineEmbedModuleOptions = {},
): string[] {
  const platform = options.platform ?? process.platform;
  const packaged = options.packaged ?? isPackagedApp();
  const resources = options.resourcesPath ?? resourcesPath();
  const electronAppPath = options.appPath ?? appPath();
  const names = moduleBasenames(platform);
  const out: string[] = [];

  if (packaged && resources) {
    const packagedDir = path.join(resources, PACKAGED_EMBED_DIR);
    for (const name of names) out.push(path.join(packagedDir, name));
  }
  if (electronAppPath) {
    const base = path.join(electronAppPath, "..", "native", "world-engine-electron-embed");
    for (const profile of ["release", "debug"]) {
      for (const name of names) {
        out.push(path.join(base, "target", profile, name));
      }
    }
  }
  return out;
}

function embedExperimentalEnabled(): boolean {
  if (process.env.WORKSPACE_WORLD_ENGINE_EMBED === "0") return false;
  if (process.env.WORKSPACE_WORLD_ENGINE_EMBED === "1") return true;
  return !isPackagedApp() && (process.platform === "darwin" || process.platform === "win32");
}

let cachedAddon: EmbedAddon | null | undefined;

function loadEmbedAddon(): EmbedAddon | null {
  if (cachedAddon !== undefined) return cachedAddon;
  const require = createRequire(import.meta.url);
  for (const candidate of worldEngineEmbedModuleCandidates()) {
    if (!existsSync(candidate)) continue;
    try {
      cachedAddon = require(candidate) as EmbedAddon;
      return cachedAddon;
    } catch {
      // try next candidate
    }
  }
  cachedAddon = null;
  return null;
}

export function isWorldEngineEmbedAvailable(): boolean {
  return embedExperimentalEnabled() && loadEmbedAddon() !== null;
}

/** Experimental: embed wgpu into the main window via native .node addon. */
export function startEmbeddedWorldEngine(
  mainWindow: BrowserWindow,
  width = 900,
  height = 600,
): { ok: boolean; error?: string } {
  if (!embedExperimentalEnabled()) {
    return {
      ok: false,
      error: "World Engine embed is disabled (set WORKSPACE_WORLD_ENGINE_EMBED=1 to enable).",
    };
  }
  const addon = loadEmbedAddon();
  if (!addon) {
    const searched = worldEngineEmbedModuleCandidates().join("\n  ");
    return {
      ok: false,
      error:
        `world-engine-electron-embed native module not found.\nSearched:\n  ${searched}\n\nRun: cd electron && npm run build:native:embed`,
    };
  }
  try {
    const [contentWidth, contentHeight] = mainWindow.getContentSize();
    const w = width > 0 ? width : contentWidth;
    const h = height > 0 ? height : contentHeight;
    mainWindow.setBackgroundColor("#00000000");
    if (process.platform === "win32" || process.platform === "darwin") {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
    addon.startEmbeddedEngine(mainWindow.getNativeWindowHandle(), w, h);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
