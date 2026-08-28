import { execFileSync, spawn } from "node:child_process";
import { accessSync, constants as fsConstants, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

// One-click "Export & Open as App" for a Godot project directory — turns
// the previous two-step manual flow (run export.sh yourself, then
// right-click the *output* folder) into a single TreeView action on the
// *project* folder itself.

// A GUI app launched via Finder/Dock inherits a minimal PATH that
// excludes Homebrew — same root cause as pty.ts's tmux/shell PATH
// handling, same fix shape.
const GODOT_PATH_CANDIDATES = [
  "/opt/homebrew/bin/godot",
  "/usr/local/bin/godot",
  "/usr/bin/godot",
  "/Applications/Godot.app/Contents/MacOS/Godot",
];

let godotBinaryCache: string | null | undefined;

export function resolveGodotBinary(): string | null {
  if (godotBinaryCache !== undefined) return godotBinaryCache;
  try {
    const resolved = execFileSync("which", ["godot"], { encoding: "utf8" }).trim();
    if (resolved) {
      godotBinaryCache = resolved;
      return godotBinaryCache;
    }
  } catch {
    // `which` not found, or godot not on the current PATH — fall through
    // to the fixed candidates below.
  }
  for (const candidate of GODOT_PATH_CANDIDATES) {
    try {
      accessSync(candidate, fsConstants.X_OK);
      godotBinaryCache = candidate;
      return godotBinaryCache;
    } catch {
      // Try the next candidate.
    }
  }
  godotBinaryCache = null;
  return null;
}

/** Only for tests — resolveGodotBinary caches its result for the process
 * lifetime, which a test needs to reset between cases. */
export function resetGodotBinaryCacheForTests(): void {
  godotBinaryCache = undefined;
}

/** Finds the first export preset targeting the Web platform in a
 * project's export_presets.cfg (Godot's own INI format) and returns its
 * `name=`, used to select `--export-release "<name>"`. Returns null if
 * the project has no export_presets.cfg yet (never configured in the
 * Godot editor) or no preset targets Web. */
export function findWebExportPresetName(projectDir: string): string | null {
  let content: string;
  try {
    content = readFileSync(path.join(projectDir, "export_presets.cfg"), "utf8");
  } catch {
    return null;
  }
  const blocks = content.split(/\n(?=\[preset\.\d+\])/);
  for (const block of blocks) {
    if (!/^\[preset\.\d+\]/.test(block)) continue;
    if (block.match(/^platform="([^"]*)"/m)?.[1] !== "Web") continue;
    const name = block.match(/^name="([^"]*)"/m)?.[1];
    if (name) return name;
  }
  return null;
}

export interface GodotExportResult {
  ok: boolean;
  error?: string;
}

/** Runs `godot --headless --export-release "<Web preset>" <outputHtmlPath>`.
 * Async (child_process.spawn, not spawnSync) — an export can take anywhere
 * from seconds to a minute+ on a real project, and this is the main
 * process; blocking it would freeze the whole app (window dragging, every
 * other IPC call) for the duration. */
export function exportGodotProjectWeb(
  projectDir: string,
  outputHtmlPath: string,
): Promise<GodotExportResult> {
  const godot = resolveGodotBinary();
  if (!godot) {
    return Promise.resolve({
      ok: false,
      error: "Godot executable not found (checked PATH and common install locations).",
    });
  }
  const presetName = findWebExportPresetName(projectDir);
  if (!presetName) {
    return Promise.resolve({
      ok: false,
      error:
        "No Web export preset found in export_presets.cfg — add one in the Godot editor (Project > Export) first.",
    });
  }
  // Godot's exporter writes into the given path's directory but doesn't
  // create it (matches test-fixtures/godot-demo/export.sh's own `mkdir -p`
  // before invoking the CLI).
  mkdirSync(path.dirname(outputHtmlPath), { recursive: true });

  return new Promise((resolve) => {
    const child = spawn(godot, [
      "--headless",
      "--path",
      projectDir,
      "--export-release",
      presetName,
      outputHtmlPath,
    ]);
    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => resolve({ ok: false, error: err.message }));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true });
      } else {
        resolve({
          ok: false,
          error: (stderr || stdout || `godot exited with code ${code}`).trim(),
        });
      }
    });
  });
}
