import { dialog, BrowserWindow, type FileFilter, type OpenDialogOptions } from "electron";
import { execFileSync } from "node:child_process";
import { isWsl, windowsPathToWsl, wslPathToWindows } from "./wslPaths";

function dialogParent(win: BrowserWindow | null | undefined): BrowserWindow | undefined {
  if (!win || win.isDestroyed()) return undefined;
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  return win;
}

function runWindowsFormsPicker(
  kind: "folder" | "file",
  options: { defaultPath?: string; filter?: string },
): string | null {
  const defaultWin =
    options.defaultPath != null
      ? wslPathToWindows(options.defaultPath) ?? options.defaultPath
      : "";
  const script =
    kind === "folder"
      ? [
          "Add-Type -AssemblyName System.Windows.Forms",
          "[System.Windows.Forms.Application]::EnableVisualStyles()",
          "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
          "$d.ShowNewFolderButton = $true",
          "if ($env:WORKSPACE_PICKER_DEFAULT) { $d.SelectedPath = $env:WORKSPACE_PICKER_DEFAULT }",
          "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }",
        ].join("; ")
      : [
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
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
      encoding: "utf8",
      timeout: 120_000,
      windowsHide: true,
      env: {
        ...process.env,
        WORKSPACE_PICKER_DEFAULT: defaultWin,
        WORKSPACE_PICKER_FILTER: options.filter ?? "",
      },
    }).trim();
    const line = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    if (!line) return null;
    return isWsl() ? windowsPathToWsl(line) : line;
  } catch {
    return null;
  }
}

export async function pickDirectory(
  parent: BrowserWindow | null | undefined,
  defaultPath?: string,
): Promise<string | null> {
  if (isWsl()) {
    return runWindowsFormsPicker("folder", { defaultPath });
  }
  const opts: OpenDialogOptions = {
    properties: ["openDirectory", "createDirectory"] as OpenDialogOptions["properties"],
    defaultPath,
  };
  const win = dialogParent(parent);
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return result.canceled ? null : (result.filePaths[0] ?? null);
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
): Promise<string | null> {
  const filter = MEDIA_DIALOG_FILTERS[kind];
  if (isWsl()) {
    return runWindowsFormsPicker("file", { filter: winFormsFileFilter(filter) });
  }
  const opts: OpenDialogOptions = {
    properties: ["openFile"] as OpenDialogOptions["properties"],
    filters: [filter, { name: "All Files", extensions: ["*"] }],
  };
  const win = dialogParent(parent);
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}
