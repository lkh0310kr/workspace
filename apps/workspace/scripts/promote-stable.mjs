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
import { existsSync, rmSync, cpSync } from "node:fs";
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
    "if ((Test-Path -LiteralPath $shortcutPath) -and (Test-ShortcutTarget $shortcutPath $exe)) {",
    "  Write-Output 'exists'",
    "  exit 0",
    "}",
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
    console.log("[promote-stable] desktop shortcut already points at install — skipped");
  } else if (result.status !== 0) {
    console.warn(
      "[promote-stable] desktop shortcut failed:",
      result.stderr?.trim() || result.stdout?.trim() || "unknown error",
    );
  }
}

function runPowerShell(script, options = {}) {
  const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    ...options,
  });
  return result;
}

function logPromoteLines(stdout) {
  const lines = stdout
    ?.trim()
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of lines ?? []) {
    console.log(`[promote-stable] ${line}`);
  }
  return lines ?? [];
}

function forceQuitInstalledWindowsApp(installDir, options = {}) {
  const maxWaitMs = options.maxWaitMs ?? 20_000;
  const ps = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$install = " + JSON.stringify(installDir),
    "$installPattern = '*{0}*' -f $install",
    "$deadline = [DateTime]::UtcNow.AddMilliseconds(" + maxWaitMs + ")",
    "function Test-InstallProcess($proc) {",
    "  if ($proc.ExecutablePath -and $proc.ExecutablePath.StartsWith($install, [System.StringComparison]::OrdinalIgnoreCase)) {",
    "    return $true",
    "  }",
    "  if ($proc.CommandLine -and ($proc.CommandLine -like $installPattern)) {",
    "    return $true",
    "  }",
    "  return $false",
    "}",
    "function Get-InstallCimProcs {",
    "  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { Test-InstallProcess $_ })",
    "}",
    "function Get-InstallPsProcs {",
    "  $names = @('electron', 'winpty-agent', 'OpenConsole', 'world-engine-qt-shell')",
    "  $found = @()",
    "  foreach ($name in $names) {",
    "    foreach ($proc in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {",
    "      try {",
    "        if ($proc.Path -and $proc.Path.StartsWith($install, [System.StringComparison]::OrdinalIgnoreCase)) {",
    "          $found += $proc",
    "        }",
    "      } catch {}",
    "    }",
    "  }",
    "  $found",
    "}",
    "function Stop-InstallProcessTree($proc) {",
    "  if ($proc.ProcessId) {",
    "    & taskkill.exe /PID $proc.ProcessId /T /F 2>$null | Out-Null",
    "    return",
    "  }",
    "  if ($proc.Id) {",
    "    & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null",
    "  }",
    "}",
    "$initial = @(Get-InstallCimProcs) + @(Get-InstallPsProcs)",
    "$initial = $initial | Sort-Object -Property { if ($_.ProcessId) { $_.ProcessId } else { $_.Id } } -Unique",
    "if ($initial.Count -gt 0) {",
    "  Write-Output (\"stopping \" + $initial.Count + \" process(es) under install dir\")",
    "  foreach ($p in $initial) {",
    "    $label = if ($p.Name) { $p.Name } elseif ($p.ProcessName) { $p.ProcessName } else { 'process' }",
    "    $pid = if ($p.ProcessId) { $p.ProcessId } else { $p.Id }",
    "    Write-Output (\"  taskkill pid=\" + $pid + \" name=\" + $label)",
    "    Stop-InstallProcessTree $p",
    "  }",
    "}",
    "while ($true) {",
    "  $procs = @(Get-InstallCimProcs) + @(Get-InstallPsProcs)",
    "  $procs = $procs | Sort-Object -Property { if ($_.ProcessId) { $_.ProcessId } else { $_.Id } } -Unique",
    "  if ($procs.Count -eq 0) { break }",
    "  foreach ($p in $procs) { Stop-InstallProcessTree $p }",
    "  if ([DateTime]::UtcNow -ge $deadline) {",
    "    Write-Output 'still-running:'",
    "    foreach ($p in $procs) {",
    "      $label = if ($p.Name) { $p.Name } elseif ($p.ProcessName) { $p.ProcessName } else { 'process' }",
    "      $pid = if ($p.ProcessId) { $p.ProcessId } else { $p.Id }",
    "      $path = if ($p.ExecutablePath) { $p.ExecutablePath } elseif ($p.Path) { $p.Path } else { '' }",
    "      Write-Output (\"  pid=\" + $pid + \" name=\" + $label + \" path=\" + $path)",
    "    }",
    "    Write-Error (\"timed out waiting for \" + $procs.Count + \" process(es) under install dir to exit\")",
    "    exit 1",
    "  }",
    "  Start-Sleep -Milliseconds 300",
    "}",
  ].join("\n");
  const result = runPowerShell(ps);
  logPromoteLines(result.stdout);
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || "unknown error";
    throw new Error(
      `Could not stop Workspace under ${installDir}. ` +
        "End electron.exe / winpty-agent.exe under Programs\\Workspace in Task Manager, then re-run npm run promote:stable. " +
        `(${detail})`,
    );
  }
}

function removeWindowsPathRecursive(targetPath) {
  const ps = [
    "$target = " + JSON.stringify(targetPath),
    "if (-not (Test-Path -LiteralPath $target)) { exit 0 }",
    "Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop",
  ].join("\n");
  const result = runPowerShell(ps);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `Remove-Item failed for ${targetPath}`);
  }
}

function moveWindowsPath(sourcePath, destPath) {
  const ps = [
    "$source = " + JSON.stringify(sourcePath),
    "$dest = " + JSON.stringify(destPath),
    "Move-Item -LiteralPath $source -Destination $dest -Force -ErrorAction Stop",
  ].join("\n");
  const result = runPowerShell(ps);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `Move-Item failed for ${sourcePath}`);
  }
}

function scheduleWindowsPathCleanup(targetPath) {
  const cleanup = [
    "Start-Sleep -Seconds 3",
    `Remove-Item -LiteralPath ${JSON.stringify(targetPath)} -Recurse -Force -ErrorAction SilentlyContinue`,
  ].join("; ");
  spawn("powershell", ["-NoProfile", "-Command", cleanup], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

function replaceWindowsInstallDir(installDir, builtDir) {
  const incomingDir = `${installDir}.incoming-${Date.now()}`;

  if (existsSync(incomingDir)) {
    removeWindowsPathRecursive(incomingDir);
  }
  cpSync(builtDir, incomingDir, { recursive: true });

  if (!existsSync(installDir)) {
    moveWindowsPath(incomingDir, installDir);
    return installDir;
  }

  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    forceQuitInstalledWindowsApp(installDir, { maxWaitMs: 8_000 });
    try {
      removeWindowsPathRecursive(installDir);
      moveWindowsPath(incomingDir, installDir);
      return installDir;
    } catch {
      if (attempt === maxAttempts - 1) break;
      console.log(`[promote-stable] install dir locked, retrying (${attempt + 1}/${maxAttempts})…`);
      sleepMs(750 * (attempt + 1));
    }
  }

  const staleDir = `${installDir}.old-${Date.now()}`;
  console.log(`[promote-stable] moving locked install dir aside → ${staleDir}`);
  forceQuitInstalledWindowsApp(installDir, { maxWaitMs: 20_000 });
  sleepMs(1000);
  try {
    moveWindowsPath(installDir, staleDir);
  } catch {
    // Install dir is still locked (often electron.exe or Defender). Promote the
    // fresh incoming tree to a sibling path and point the shortcut there.
    const altInstallDir = `${installDir}.run-${Date.now()}`;
    console.log(`[promote-stable] install dir still locked; promoting incoming build → ${altInstallDir}`);
    moveWindowsPath(incomingDir, altInstallDir);
    scheduleWindowsPathCleanup(installDir);
    console.warn(
      "[promote-stable] left the locked install tree in place; it will be deleted in the background when Windows releases the lock.",
    );
    return altInstallDir;
  }

  moveWindowsPath(incomingDir, installDir);
  scheduleWindowsPathCleanup(staleDir);
  return installDir;
}

function promoteWindows() {
  const installDir = path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Workspace");
  const builtDir = path.join(root, "dist", "win-unpacked");
  const builtExe = path.join(builtDir, "electron.exe");
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
  forceQuitInstalledWindowsApp(installDir);

  console.log(`[promote-stable] installing to ${installDir}…`);
  const activeInstallDir = replaceWindowsInstallDir(installDir, builtDir);
  const activeExe = path.join(activeInstallDir, "electron.exe");

  ensureWindowsDesktopShortcut(activeInstallDir, activeExe);

  console.log("[promote-stable] relaunching…");
  sleepMs(500);
  const child = spawn(activeExe, [], { detached: true, stdio: "ignore", windowsHide: true });
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
