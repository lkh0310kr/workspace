import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

/** True when running inside WSL (Windows Subsystem for Linux). */
export function isWsl(): boolean {
  if (process.platform !== "linux") return false;
  try {
    return fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

function powershell(command: string, timeout = 5000): string {
  // execFileSync (no shell) — keeps $vars intact; execSync under /bin/sh eats them.
  return execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    timeout,
    windowsHide: true,
  }).trim();
}

/**
 * Windows DPI scale (1.0 = 100%, 1.25 = 125%) or null if unknown.
 * WSLg's X11 screen often reports physical pixels with scaleFactor=1, so Electron
 * maximize/hit-test use 1920×1080 while the RAIL host window is 1536×864 — content
 * and clicks drift down-right. Force Chromium's device scale to match Windows.
 *
 * Prefer HKCU\...\WindowMetrics AppliedDPI (user scaling). Process-DPI APIs often
 * return 96 under WSL/powershell even when Windows display scaling is 125%.
 */
export function readWindowsDpiScale(): number | null {
  if (!isWsl()) return null;
  try {
    const raw = powershell(
      "try { (Get-ItemProperty 'HKCU:\\Control Panel\\Desktop\\WindowMetrics').AppliedDPI } catch { '' }",
    );
    const line = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s))
      .pop();
    const dpi = line ? parseInt(line, 10) : NaN;
    if (Number.isFinite(dpi) && dpi >= 96) return dpi / 96;
  } catch {
    /* fall through */
  }
  // Fallback: physical video mode / GetSystemMetrics logical size.
  try {
    const raw = powershell(
      "$v=(Get-CimInstance Win32_VideoController | Where-Object { $_.CurrentHorizontalResolution } | Select-Object -First 1); $sm=Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern int GetSystemMetrics(int n);' -Name SM -Namespace W -PassThru; if ($v -and $sm) { [math]::Round($v.CurrentHorizontalResolution / $sm::GetSystemMetrics(0), 4) }",
      8000,
    );
    const line = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^\d+(\.\d+)?$/.test(s))
      .pop();
    const scale = line ? parseFloat(line) : NaN;
    if (Number.isFinite(scale) && scale >= 1) return scale;
  } catch {
    /* ignore */
  }
  return null;
}

/** Call before app.ready. Returns the scale forced, or null if unchanged. */
export function applyWslDpiScaleFix(appendSwitch: (name: string, value: string) => void): number | null {
  const scale = readWindowsDpiScale();
  if (scale == null || Math.abs(scale - 1) < 0.01) return null;
  // Keep a short string Chromium accepts (1.25, 1.5, …).
  const value = String(Math.round(scale * 100) / 100);
  appendSwitch("force-device-scale-factor", value);
  return scale;
}

/**
 * Windows primary-monitor working area in DIPs (excludes taskbar).
 * Electron/WSLg often reports workArea === display.bounds; use this for
 * setBounds instead of maximize() so the window matches the RAIL host.
 */
export function readWindowsWorkingArea(): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!isWsl()) return null;
  try {
    const raw = powershell(
      "Add-Type -AssemblyName System.Windows.Forms; $w=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; Write-Output ('{0},{1},{2},{3}' -f $w.X,$w.Y,$w.Width,$w.Height)",
    );
    const m = raw.match(/(-?\d+)\s*,\s*(-?\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return null;
    const area = {
      x: parseInt(m[1], 10),
      y: parseInt(m[2], 10),
      width: parseInt(m[3], 10),
      height: parseInt(m[4], 10),
    };
    if (area.width < 200 || area.height < 200) return null;
    return area;
  } catch {
    return null;
  }
}

/**
 * `/mnt/<drive>/...` paths are 9p mounts into the Windows filesystem.
 * Sync I/O there can freeze Electron's main thread for minutes — never use
 * them as the live workspace root when a Linux-native copy is available.
 */
export function isWslWindowsMountPath(p: string): boolean {
  return isWsl() && /^\/mnt\/[a-zA-Z]\//.test(p);
}

/**
 * Prefer a Linux-home mirror of a Windows-mount workspace when present
 * (`/mnt/c/Users/.../workspace/...` → `$HOME/workspace/...`). Falls back to
 * `cwd` rather than blocking on 9p if nothing better exists.
 */
export function preferNativeWorkspacePath(candidate: string, cwd: string = process.cwd()): string {
  if (!isWslWindowsMountPath(candidate)) return candidate;

  const homeWorkspace = path.join(os.homedir(), "workspace");
  const marker = "/workspace";
  const idx = candidate.lastIndexOf(marker);
  if (idx !== -1 && fs.existsSync(homeWorkspace)) {
    const suffix = candidate.slice(idx + marker.length).replace(/^\//, "");
    const mapped = suffix ? path.join(homeWorkspace, suffix) : homeWorkspace;
    if (fs.existsSync(mapped)) return mapped;
    return homeWorkspace;
  }

  if (!isWslWindowsMountPath(cwd) && fs.existsSync(cwd)) return cwd;
  return candidate;
}

export function remapWorkspaceRootsInSnapshot<T extends { tabs: Array<{ rootPath: string }> }>(
  snapshot: T,
): T {
  if (!isWsl()) return snapshot;
  let changed = false;
  const tabs = snapshot.tabs.map((tab) => {
    const next = preferNativeWorkspacePath(tab.rootPath);
    if (next !== tab.rootPath) {
      changed = true;
      return { ...tab, rootPath: next };
    }
    return tab;
  });
  return changed ? { ...snapshot, tabs } : snapshot;
}

/** `C:\Users\foo` → `/mnt/c/Users/foo` (identity when not a Windows path). */
export function windowsPathToWsl(winPath: string): string {
  const normalized = winPath.trim().replace(/\//g, "\\");
  const match = /^([A-Za-z]):\\(.*)$/.exec(normalized);
  if (!match) return winPath;
  const rest = match[2].replace(/\\/g, "/").replace(/\/+$/, "");
  return rest ? `/mnt/${match[1].toLowerCase()}/${rest}` : `/mnt/${match[1].toLowerCase()}`;
}

/** `/mnt/c/Users/foo` → `C:\Users\foo` (identity when not a /mnt path). */
export function wslPathToWindows(wslPath: string): string | null {
  const match = /^\/mnt\/([a-zA-Z])\/(.*)$/.exec(wslPath.replace(/\\/g, "/"));
  if (!match) return null;
  const rest = match[2].replace(/\//g, "\\");
  return `${match[1].toUpperCase()}:\\${rest}`;
}
