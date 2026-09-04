#!/usr/bin/env node
/**
 * Build the current source and install it as the daily-driver app, then relaunch.
 *
 * - macOS: /Applications/Workspace.app
 * - Windows: %LOCALAPPDATA%\Programs\Workspace (unpacked electron-builder output)
 *   + desktop shortcut `Workspace.lnk` when not already on the desktop
 *
 * No GitHub release, no version bump, no update server — single-machine personal app.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync, cpSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sleepMs(ms) {
  spawnSync("powershell", ["-NoProfile", "-Command", `Start-Sleep -Milliseconds ${ms}`], {
    stdio: "ignore",
  });
}

function promoteMac() {
  const builtApp = path.join(root, "dist", "mac-arm64", "Workspace.app");
  const installedApp = "/Applications/Workspace.app";

  console.log("[promote-stable] building…");
  execFileSync("npx", ["electron-vite", "build"], { cwd: root, stdio: "inherit" });
  execFileSync("npx", ["electron-builder", "--mac", "--dir"], { cwd: root, stdio: "inherit" });

  if (!existsSync(builtApp)) {
    console.error(`[promote-stable] expected build output missing: ${builtApp}`);
    process.exit(1);
  }

  console.log("[promote-stable] quitting the running stable app, if any…");
  try {
    execFileSync("pkill", ["-x", "Workspace"], { stdio: "ignore" });
  } catch {
    /* not running */
  }

  console.log(`[promote-stable] installing to ${installedApp}…`);
  rmSync(installedApp, { recursive: true, force: true });
  cpSync(builtApp, installedApp, { recursive: true, dereference: false, verbatimSymlinks: true });

  console.log("[promote-stable] relaunching…");
  execFileSync("open", ["-a", installedApp]);
}

const WINDOWS_SHORTCUT_NAME = "Workspace";

function ensureWindowsDesktopShortcut(installDir, installedExe) {
  const ps = [
    "$installDir = " + JSON.stringify(installDir),
    "$exe = " + JSON.stringify(installedExe),
    "$desktop = [Environment]::GetFolderPath('Desktop')",
    "$shortcutPath = Join-Path $desktop " + JSON.stringify(WINDOWS_SHORTCUT_NAME + ".lnk"),
    "$shell = New-Object -ComObject WScript.Shell",
    "function Test-ShortcutTarget($path, $expected) {",
    "  if (-not (Test-Path -LiteralPath $path)) { return $false }",
    "  try {",
    "    $target = $shell.CreateShortcut($path).TargetPath",
    "    if (-not $target) { return $false }",
    "    $resolvedTarget = (Resolve-Path -LiteralPath $target -ErrorAction SilentlyContinue).Path",
    "    $resolvedExpected = (Resolve-Path -LiteralPath $expected -ErrorAction SilentlyContinue).Path",
    "    if ($resolvedTarget -and $resolvedExpected) { return $resolvedTarget -eq $resolvedExpected }",
    "    return $target -eq $expected",
    "  } catch { return $false }",
    "}",
    "if (Test-Path -LiteralPath $shortcutPath) { Write-Output 'exists'; exit 0 }",
    "foreach ($lnk in Get-ChildItem -LiteralPath $desktop -Filter '*.lnk' -ErrorAction SilentlyContinue) {",
    "  if (Test-ShortcutTarget $lnk.FullName $exe) { Write-Output 'exists'; exit 0 }",
    "}",
    "$shortcut = $shell.CreateShortcut($shortcutPath)",
    "$shortcut.TargetPath = $exe",
    "$shortcut.WorkingDirectory = $installDir",
    "$shortcut.Description = " + JSON.stringify(WINDOWS_SHORTCUT_NAME),
    "$shortcut.Save()",
    "Write-Output 'created'",
  ].join("\n");

  const result = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
  const line = result.stdout
    ?.trim()
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  if (line === "created") {
    console.log(`[promote-stable] desktop shortcut created (${WINDOWS_SHORTCUT_NAME}.lnk)`);
  } else if (line === "exists") {
    console.log("[promote-stable] desktop shortcut already present — skipped");
  } else if (result.status !== 0) {
    console.warn(
      "[promote-stable] desktop shortcut failed:",
      result.stderr?.trim() || result.stdout?.trim() || "unknown error",
    );
  }
}

function stopInstalledWindowsApp(installDir) {
  const ps = [
    "$install = " + JSON.stringify(installDir),
    "$procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |",
    "  Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($install, [System.StringComparison]::OrdinalIgnoreCase) })",
    "if ($procs.Count -gt 0) {",
    "  Write-Output (\"stopping \" + $procs.Count + \" process(es) under install dir\")",
    "  foreach ($p in $procs) {",
    "    & taskkill.exe /PID $p.ProcessId /T /F 2>$null | Out-Null",
    "  }",
    "  Start-Sleep -Milliseconds 750",
    "}",
  ].join("\n");
  const result = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
  const line = result.stdout?.trim();
  if (line) console.log(`[promote-stable] ${line}`);
}

function replaceWindowsInstallDir(installDir, builtDir) {
  if (!existsSync(installDir)) {
    cpSync(builtDir, installDir, { recursive: true });
    return;
  }

  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    stopInstalledWindowsApp(installDir);
    try {
      rmSync(installDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      cpSync(builtDir, installDir, { recursive: true });
      return;
    } catch (err) {
      if (attempt === maxAttempts - 1) break;
      console.log(`[promote-stable] install dir locked, retrying (${attempt + 1}/${maxAttempts})…`);
      sleepMs(500 * (attempt + 1));
    }
  }

  const staleDir = `${installDir}.old-${Date.now()}`;
  console.log(`[promote-stable] moving locked install dir aside → ${staleDir}`);
  stopInstalledWindowsApp(installDir);
  sleepMs(750);
  try {
    renameSync(installDir, staleDir);
  } catch {
    throw new Error(
      `Could not replace ${installDir} (files still in use). ` +
        "Close Workspace from Task Manager (end electron.exe under Programs\\Workspace), then re-run npm run promote:stable.",
    );
  }

  cpSync(builtDir, installDir, { recursive: true });

  const cleanup = [
    "Start-Sleep -Seconds 2",
    `Remove-Item -LiteralPath ${JSON.stringify(staleDir)} -Recurse -Force -ErrorAction SilentlyContinue`,
  ].join("; ");
  spawn("powershell", ["-NoProfile", "-Command", cleanup], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

function promoteWindows() {
  const installDir = path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Workspace");
  const builtDir = path.join(root, "dist", "win-unpacked");
  const builtExe = path.join(builtDir, "electron.exe");
  const installedExe = path.join(installDir, "electron.exe");
  const buildScript = path.join(root, "scripts", "build-world-engine-and-electron-win.ps1");

  console.log("[promote-stable] building (world-engine + electron)…");
  const build = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", buildScript, "-DirOnly"],
    { cwd: root, stdio: "inherit" },
  );
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  if (!existsSync(builtExe)) {
    console.error(`[promote-stable] expected build output missing: ${builtExe}`);
    process.exit(1);
  }

  console.log("[promote-stable] quitting the running stable app, if any…");
  console.log(`[promote-stable] installing to ${installDir}…`);
  replaceWindowsInstallDir(installDir, builtDir);

  ensureWindowsDesktopShortcut(installDir, installedExe);

  console.log("[promote-stable] relaunching…");
  const child = spawn(installedExe, [], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

if (process.platform === "darwin") {
  promoteMac();
} else if (process.platform === "win32") {
  promoteWindows();
} else {
  console.error("promote-stable supports macOS and Windows only.");
  process.exit(1);
}

console.log("[promote-stable] done.");
