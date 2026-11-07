import { dialog, BrowserWindow, type FileFilter, type OpenDialogOptions } from "electron";
import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { isWsl, windowsPathToWsl, wslPathToWindows } from "./wslPaths";

const execFileAsync = promisify(execFile);
const CSC = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
const FOLDER_PICKER_EXE = "workspace-folder-picker.exe";
const WACP_DLLS = ["Microsoft.WindowsAPICodePack.dll", "Microsoft.WindowsAPICodePack.Shell.dll"] as const;

const LOG_PATH = path.join(os.homedir(), ".config", "workspace-app-dev", "folder-picker.log");

export type DirectoryPickResult =
  | { ok: true; path: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

function logPicker(step: string, detail?: Record<string, unknown>): void {
  const payload = detail ? ` ${JSON.stringify(detail)}` : "";
  const line = `[${new Date().toISOString()}] ${step}${payload}\n`;
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    // ignore log write failures
  }
  console.log(`[folder-picker] ${step}`, detail ?? "");
}

function dialogParent(win: BrowserWindow | null | undefined): BrowserWindow | undefined {
  if (!win || win.isDestroyed()) return undefined;
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  return win;
}

function scriptsDir(): string {
  return path.join(__dirname, "../../scripts");
}

function wacpLibDir(): string {
  return path.join(scriptsDir(), "winapicodepack");
}

function readWindowsUsername(): string {
  try {
    const name = execFileSync("cmd.exe", ["/c", "echo", "%USERNAME%"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    })
      .trim()
      .split(/\r?\n/)
      .pop()
      ?.trim();
    if (name) return name;
  } catch (err) {
    logPicker("readWindowsUsername failed", { err: String(err) });
  }
  return "14ZB990";
}

/** Windows-native cache dir (`C:\\Users\\…\\AppData\\Local\\workspace-app\\picker`). */
function windowsPickerCacheDir(): string {
  const user = readWindowsUsername();
  return path.join("/mnt/c/Users", user, "AppData/Local/workspace-app/picker");
}

function psQuote(value: string): string {
  return value.replace(/'/g, "''");
}

/** Last non-empty line from a native picker helper's stdout. */
export function parseWindowsPickerOutput(raw: string): string | null {
  const line = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  return line ?? null;
}

function copyFileIfMissingOrOlder(source: string, dest: string): void {
  if (!fs.existsSync(source)) {
    throw new Error(`missing source file: ${source}`);
  }
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(source, dest);
    return;
  }
  if (fs.statSync(source).mtimeMs > fs.statSync(dest).mtimeMs) {
    fs.copyFileSync(source, dest);
  }
}

async function ensureFolderPickerExe(): Promise<{ linuxDir: string; winDir: string; winExe: string }> {
  const sourceCs = path.join(scriptsDir(), "FolderPicker.cs");
  const libDir = wacpLibDir();
  const cacheDir = windowsPickerCacheDir();
  const exePath = path.join(cacheDir, FOLDER_PICKER_EXE);
  const winDir = wslPathToWindows(cacheDir);
  const winExe = winDir ? `${winDir}\\${FOLDER_PICKER_EXE}` : null;

  logPicker("ensureFolderPickerExe", {
    sourceCs,
    libDir,
    cacheDir,
    winDir,
    winExe,
    sourceCsExists: fs.existsSync(sourceCs),
    libDirExists: fs.existsSync(libDir),
  });

  if (!fs.existsSync(sourceCs)) {
    throw new Error(`FolderPicker.cs not found at ${sourceCs}`);
  }
  if (!fs.existsSync(libDir)) {
    throw new Error(`Windows API Code Pack libs not found at ${libDir}`);
  }
  if (!winDir || !winExe) {
    throw new Error(`Could not map picker cache dir to Windows: ${cacheDir}`);
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  for (const dll of WACP_DLLS) {
    copyFileIfMissingOrOlder(path.join(libDir, dll), path.join(cacheDir, dll));
  }

  const csMtime = fs.statSync(sourceCs).mtimeMs;
  let rebuild = !fs.existsSync(exePath);
  if (!rebuild) {
    rebuild = fs.statSync(exePath).mtimeMs < csMtime;
  }
  if (rebuild) {
    const winSourceCs = wslPathToWindows(sourceCs);
    if (!winSourceCs) throw new Error(`Could not map FolderPicker.cs to Windows: ${sourceCs}`);
    const refs = WACP_DLLS.map((dll) => `/r:'${winDir}\\${dll}'`).join(" ");
    const compileCmd = `& '${CSC}' /nologo /target:exe /out:'${winExe}' ${refs} '${winSourceCs}'`;
    logPicker("compile folder picker", { compileCmd });
    const { stdout, stderr } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", compileCmd],
      { windowsHide: true, timeout: 60_000, encoding: "utf8" },
    );
    logPicker("compile finished", {
      stdout: stdout?.trim().slice(0, 500),
      stderr: stderr?.trim().slice(0, 500),
      exeExists: fs.existsSync(exePath),
    });
    if (!fs.existsSync(exePath)) {
      throw new Error(`folder picker compile failed — ${stderr || stdout || "no output"}`);
    }
  }

  return { linuxDir: cacheDir, winDir, winExe };
}

/** Vista+ Explorer-style folder picker (CommonOpenFileDialog / IFileOpenDialog). */
async function runModernWindowsFolderPicker(defaultPath?: string): Promise<DirectoryPickResult> {
  logPicker("runModernWindowsFolderPicker start", { defaultPath });
  try {
    const { winDir, winExe } = await ensureFolderPickerExe();
    const defaultWin =
      defaultPath != null ? wslPathToWindows(defaultPath) ?? defaultPath : "";
    const command = `Set-Location '${psQuote(winDir)}'; & '.\\${FOLDER_PICKER_EXE}' '${psQuote(defaultWin)}' '${psQuote("Select folder")}'`;
    logPicker("invoke picker", { command, winExe, defaultWin });

    const { stdout, stderr } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-STA", "-Command", command],
      {
        encoding: "utf8",
        timeout: 120_000,
        windowsHide: false,
        maxBuffer: 1024 * 1024,
      },
    );

    logPicker("picker exited", {
      stdout: stdout?.trim().slice(0, 500),
      stderr: stderr?.trim().slice(0, 500),
    });

    const line = parseWindowsPickerOutput(stdout);
    if (!line) {
      return { ok: false, canceled: true };
    }
    const mapped = isWsl() ? windowsPathToWsl(line) : line;
    logPicker("picker selected", { line, mapped });
    return { ok: true, path: mapped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr?: string }).stderr ?? "")
        : "";
    logPicker("picker failed", { message, stderr: stderr.slice(0, 1000) });
    return { ok: false, canceled: false, error: stderr ? `${message}\n${stderr}` : message };
  }
}

async function runWindowsFilePicker(options: { defaultPath?: string; filter?: string }): Promise<DirectoryPickResult> {
  const defaultWin =
    options.defaultPath != null
      ? wslPathToWindows(options.defaultPath) ?? options.defaultPath
      : "";
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "$d = New-Object System.Windows.Forms.OpenFileDialog",
    "if ($env:WORKSPACE_PICKER_FILTER) { $d.Filter = $env:WORKSPACE_PICKER_FILTER }",
    "if ($env:WORKSPACE_PICKER_DEFAULT) {",
    "  $d.InitialDirectory = [System.IO.Path]::GetDirectoryName($env:WORKSPACE_PICKER_DEFAULT)",
    "  $leaf = [System.IO.Path]::GetFileName($env:WORKSPACE_PICKER_DEFAULT)",
    "  if ($leaf) { $d.FileName = $leaf }",
    "}",
    "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }",
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-STA", "-Command", script],
      {
        encoding: "utf8",
        timeout: 120_000,
        windowsHide: false,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          WORKSPACE_PICKER_DEFAULT: defaultWin,
          WORKSPACE_PICKER_FILTER: options.filter ?? "",
        },
      },
    );
    const line = parseWindowsPickerOutput(stdout);
    if (!line) return { ok: false, canceled: true };
    const mapped = isWsl() ? windowsPathToWsl(line) : line;
    return { ok: true, path: mapped };
  } catch (err) {
    return {
      ok: false,
      canceled: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function pickDirectory(
  parent: BrowserWindow | null | undefined,
  defaultPath?: string,
): Promise<DirectoryPickResult> {
  if (isWsl()) {
    return runModernWindowsFolderPicker(defaultPath);
  }
  const opts: OpenDialogOptions = {
    properties: ["openDirectory", "createDirectory"] as OpenDialogOptions["properties"],
    defaultPath,
  };
  const win = dialogParent(parent);
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (result.canceled) return { ok: false, canceled: true };
  const picked = result.filePaths[0];
  if (!picked) return { ok: false, canceled: true };
  return { ok: true, path: picked };
}

const MEDIA_DIALOG_FILTERS: Record<"video" | "audio" | "ebook", FileFilter> = {
  video: { name: "Video", extensions: ["mp4", "webm", "mov", "mkv"] },
  audio: { name: "Audio", extensions: ["mp3", "wav", "m4a", "ogg", "flac"] },
  ebook: { name: "Ebook", extensions: ["epub"] },
};

function winFormsFileFilter(filter: FileFilter): string {
  const patterns = filter.extensions.map((ext) => `*.${ext}`).join(";");
  return `${filter.name}|${patterns}|All Files|*.*`;
}

export async function pickMediaFile(
  parent: BrowserWindow | null | undefined,
  kind: "video" | "audio" | "ebook",
): Promise<DirectoryPickResult> {
  const filter = MEDIA_DIALOG_FILTERS[kind];
  if (isWsl()) {
    return runWindowsFilePicker({ filter: winFormsFileFilter(filter) });
  }
  const opts: OpenDialogOptions = {
    properties: ["openFile"] as OpenDialogOptions["properties"],
    filters: [filter, { name: "All Files", extensions: ["*"] }],
  };
  const win = dialogParent(parent);
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (result.canceled) return { ok: false, canceled: true };
  const picked = result.filePaths[0];
  if (!picked) return { ok: false, canceled: true };
  return { ok: true, path: picked };
}
