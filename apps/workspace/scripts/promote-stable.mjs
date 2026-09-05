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
import { existsSync, rmSync, cpSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
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

  const result = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", windowsHide: true });
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

function runPowerShellFile(script) {
  const scriptPath = path.join(tmpdir(), `promote-stable-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`);
  writeFileSync(scriptPath, script, "utf8");
  try {
    return spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      encoding: "utf8",
      windowsHide: true,
    });
  } finally {
    try {
      unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
}

function runPowerShell(script) {
  return runPowerShellFile(script);
}

function taskkillTree(pid) {
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
}

/** Return PIDs whose exe/cmdline lives under installDir (never throws). */
function listInstallProcessIds(installDir) {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$install = " + JSON.stringify(installDir),
    "$pids = New-Object 'System.Collections.Generic.HashSet[int]'",
    "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {",
    "  $hit = $false",
    "  if ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($install, [System.StringComparison]::OrdinalIgnoreCase)) { $hit = $true }",
    "  elseif ($_.CommandLine -and $_.CommandLine.IndexOf($install, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { $hit = $true }",
    "  if ($hit) { [void]$pids.Add([int]$_.ProcessId) }",
    "}",
    "foreach ($name in @('electron', 'winpty-agent', 'OpenConsole', 'world-engine-qt-shell')) {",
    "  Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {",
    "    try {",
    "      if ($_.Path -and $_.Path.StartsWith($install, [System.StringComparison]::OrdinalIgnoreCase)) {",
    "        [void]$pids.Add([int]$_.Id)",
    "      }",
    "    } catch {}",
    "  }",
    "}",
    "foreach ($procId in $pids) { Write-Output $procId }",
    "exit 0",
  ].join("\r\n");
  const result = runPowerShell(script);
  const pids = new Set();
  for (const line of (result.stdout ?? "").split(/\r?\n/)) {
    const pid = Number.parseInt(line.trim(), 10);
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

/**
 * macOS pkill equivalent: kill every process under the stable install dir.
 * Never aborts promote — install retries handle any remaining file locks.
 */
function forceQuitInstalledWindowsApp(installDir, options = {}) {
  if (!existsSync(installDir)) {
    return;
  }
  const maxWaitMs = options.maxWaitMs ?? 20_000;
  const deadline = Date.now() + maxWaitMs;
  let logged = false;

  while (Date.now() < deadline) {
    const pids = listInstallProcessIds(installDir);
    if (pids.length === 0) {
      if (logged) {
        console.log("[promote-stable] all install-dir processes exited");
      }
      return;
    }
    if (!logged) {
      console.log(`[promote-stable] stopping ${pids.length} process(es) under install dir`);
      logged = true;
    }
    for (const procId of pids) {
      console.log(`[promote-stable]   taskkill /PID ${procId} /T /F`);
      taskkillTree(procId);
    }
    sleepMs(400);
  }

  const remaining = listInstallProcessIds(installDir);
  if (remaining.length > 0) {
    console.warn(
      `[promote-stable] warning: ${remaining.length} process(es) still running under install dir; continuing install anyway`,
    );
    for (const procId of remaining) {
      console.warn(`[promote-stable]   still running pid=${procId}`);
    }
  }
}

function removeWindowsPathRecursive(targetPath) {
  if (!existsSync(targetPath)) {
    return true;
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$target = " + JSON.stringify(targetPath),
    "if (Test-Path -LiteralPath $target) {",
    "  Remove-Item -LiteralPath $target -Recurse -Force",
    "}",
  ].join("\r\n");
  const result = runPowerShell(script);
  return result.status === 0;
}

function moveWindowsPath(sourcePath, destPath) {
  if (!existsSync(sourcePath)) {
    return false;
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$source = " + JSON.stringify(sourcePath),
    "$dest = " + JSON.stringify(destPath),
    "Move-Item -LiteralPath $source -Destination $dest -Force",
  ].join("\r\n");
  const result = runPowerShell(script);
  return result.status === 0;
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
  removeWindowsPathRecursive(incomingDir);
  cpSync(builtDir, incomingDir, { recursive: true });

  const promoteIncomingTo = (destDir) => {
    removeWindowsPathRecursive(destDir);
    if (moveWindowsPath(incomingDir, destDir)) {
      return destDir;
    }
    // Copy fallback when Move-Item fails across volumes or paths.
    cpSync(incomingDir, destDir, { recursive: true });
    removeWindowsPathRecursive(incomingDir);
    return destDir;
  };

  if (!existsSync(installDir)) {
    return promoteIncomingTo(installDir);
  }

  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    forceQuitInstalledWindowsApp(installDir, { maxWaitMs: 8_000 });
    if (removeWindowsPathRecursive(installDir) && existsSync(incomingDir)) {
      if (moveWindowsPath(incomingDir, installDir)) {
        return installDir;
      }
      return promoteIncomingTo(installDir);
    }
    if (attempt < maxAttempts - 1) {
      console.log(`[promote-stable] install dir locked, retrying (${attempt + 1}/${maxAttempts})…`);
      sleepMs(750 * (attempt + 1));
    }
  }

  const staleDir = `${installDir}.old-${Date.now()}`;
  console.log(`[promote-stable] moving locked install dir aside → ${staleDir}`);
  forceQuitInstalledWindowsApp(installDir, { maxWaitMs: 20_000 });
  sleepMs(1000);

  if (moveWindowsPath(installDir, staleDir)) {
    scheduleWindowsPathCleanup(staleDir);
    return promoteIncomingTo(installDir);
  }

  const altInstallDir = `${installDir}.run-${Date.now()}`;
  console.log(`[promote-stable] install dir still locked; promoting incoming build → ${altInstallDir}`);
  const activeDir = promoteIncomingTo(altInstallDir);
  scheduleWindowsPathCleanup(installDir);
  scheduleWindowsPathCleanup(staleDir);
  console.warn(
    "[promote-stable] left the locked install tree in place; it will be deleted in the background when Windows releases the lock.",
  );
  return activeDir;
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
