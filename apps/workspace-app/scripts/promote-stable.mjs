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
import { existsSync, rmSync, cpSync, writeFileSync, unlinkSync, renameSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function getPromotedAppEnvironment() {
  const env = { ...process.env };
  // Codex and other automation hosts may set NO_COLOR for their own output.
  // Do not let that launcher-only preference disable color in Workspace's
  // interactive terminal sessions after promoting the desktop app.
  delete env.NO_COLOR;
  return env;
}

function sleepMs(ms) {
  spawnSync("powershell", ["-NoProfile", "-Command", `Start-Sleep -Milliseconds ${ms}`], {
    stdio: "ignore",
  });
}

const WORKSPACE_BUNDLE_EXECUTABLE = /\/Applications\/Workspace[^/]*\.app\/Contents\/MacOS\/Workspace(?! Helper)(?:\s|$)/;

function listWorkspaceMainPids() {
  const result = spawnSync("ps", ["-A", "-o", "pid=,command="], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`could not inspect Workspace processes: ${result.stderr?.trim() || "ps failed"}`);
  return (result.stdout ?? "").split(/\r?\n/).flatMap(line => {
    if (!WORKSPACE_BUNDLE_EXECUTABLE.test(line) || line.includes("ptyHostDaemon.js")) return [];
    const pid = Number.parseInt(line.trim().split(/\s+/, 1)[0], 10);
    return Number.isFinite(pid) && pid !== process.pid ? [pid] : [];
  });
}

async function stopWorkspaceMacProcesses() {
  let pids = listWorkspaceMainPids();
  for (const pid of pids) {
    try { process.kill(pid, "SIGTERM"); } catch { /* exited between listing and signal */ }
  }
  const gracefulDeadline = Date.now() + 12_000;
  while (Date.now() < gracefulDeadline) {
    pids = listWorkspaceMainPids();
    if (pids.length === 0) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  for (const pid of pids) {
    console.warn(`[promote-stable] force-stopping Workspace process ${pid} after graceful shutdown timeout`);
    try { process.kill(pid, "SIGKILL"); } catch { /* exited between listing and signal */ }
  }
  const forceDeadline = Date.now() + 3_000;
  while (Date.now() < forceDeadline && listWorkspaceMainPids().length > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (listWorkspaceMainPids().length > 0) throw new Error("could not stop all Workspace app instances");
}

async function stopWorkspacePtyHostMacProcesses() {
  const result = spawnSync("ps", ["-A", "-o", "pid=,command="], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`could not inspect PTY host processes: ${result.stderr?.trim() || "ps failed"}`);
  const pids = (result.stdout ?? "").split(/\r?\n/).flatMap(line => {
    if (!WORKSPACE_BUNDLE_EXECUTABLE.test(line) || !line.includes("ptyHostDaemon.js")) return [];
    const pid = Number.parseInt(line.trim().split(/\s+/, 1)[0], 10);
    return Number.isFinite(pid) && pid !== process.pid ? [pid] : [];
  });
  for (const pid of pids) {
    console.log(`[promote-stable] stopping detached PTY host ${pid}`);
    try { process.kill(pid, "SIGTERM"); } catch { /* exited between listing and signal */ }
  }
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const alive = pids.filter(pid => {
      try { process.kill(pid, 0); return true; } catch { return false; }
    });
    if (alive.length === 0) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  for (const pid of pids) {
    try { process.kill(pid, "SIGKILL"); } catch { /* already exited */ }
  }
}

function readStartupEvents() {
  const file = path.join(homedir(), "Library", "Application Support", "workspace-app", "logs", "startup.ndjson");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\r?\n/).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

async function promoteMac() {
  const builtApp = path.join(root, "dist", "mac-arm64", "Workspace.app");
  const installedApp = "/Applications/Workspace.app";

  const identities = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  const hasValidIdentity = /\b[1-9]\d* valid identities found\b/.test(identities.stdout ?? "");
  const signingIdentity = process.env.PROMOTE_STABLE_MAC_IDENTITY;
  if (!signingIdentity && !hasValidIdentity) {
    throw new Error(
      "No valid macOS code-signing identity is available. Install/select the Developer ID Application certificate used for Workspace before promoting; ad-hoc signed Electron builds cannot be launched reliably by macOS.",
    );
  }
  if (process.env.PROMOTE_STABLE_SKIP_BUILD === "1") {
    console.log("[promote-stable] using the existing production build…");
  } else {
    console.log("[promote-stable] building…");
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  }
  // The `dir` target does not cause electron-builder to write app-update.yml.
  // Build the ZIP target so the installed app carries the same updater config
  // as the public macOS release package.
  const builderArgs = ["electron-builder", "--mac", "zip", "--publish", "never"];
  if (signingIdentity) builderArgs.push(`-c.mac.identity=${signingIdentity}`);
  if (process.env.PROMOTE_STABLE_MAC_ENTITLEMENTS) {
    builderArgs.push(`-c.mac.entitlements=${path.resolve(process.env.PROMOTE_STABLE_MAC_ENTITLEMENTS)}`);
  }
  if (process.env.PROMOTE_STABLE_MAC_ENTITLEMENTS_INHERIT) {
    builderArgs.push(`-c.mac.entitlementsInherit=${path.resolve(process.env.PROMOTE_STABLE_MAC_ENTITLEMENTS_INHERIT)}`);
  }
  const electronDist = process.env.PROMOTE_STABLE_ELECTRON_DIST
    ? path.resolve(process.env.PROMOTE_STABLE_ELECTRON_DIST)
    : path.join(root, "node_modules", "electron", "dist");
  if (existsSync(electronDist)) {
    builderArgs.push(`-c.electronDist=${electronDist}`);
  }
  execFileSync("npx", builderArgs, { cwd: root, stdio: "inherit" });

  if (!existsSync(builtApp)) {
    console.error(`[promote-stable] expected build output missing: ${builtApp}`);
    process.exit(1);
  }
  if (!existsSync(path.join(builtApp, "Contents", "Resources", "app-update.yml"))) {
    throw new Error("The packaged Workspace app is missing its GitHub updater configuration (app-update.yml).");
  }

  execFileSync("codesign", ["--verify", "--deep", "--strict", builtApp], { stdio: "inherit" });

  console.log("[promote-stable] quitting every running Workspace app instance…");
  await stopWorkspaceMacProcesses();
  if (process.env.PROMOTE_STABLE_RESTART_PTY_HOST === "1") {
    await stopWorkspacePtyHostMacProcesses();
  }

  console.log(`[promote-stable] installing to ${installedApp}…`);
  const incomingApp = `${installedApp}.incoming-${Date.now()}`;
  const backupApp = `${installedApp}.previous-${new Date().toISOString().replace(/[:.]/g, "-")}.app`;
  rmSync(incomingApp, { recursive: true, force: true });
  cpSync(builtApp, incomingApp, { recursive: true, dereference: false, verbatimSymlinks: true });
  if (existsSync(installedApp)) renameSync(installedApp, backupApp);
  try {
    renameSync(incomingApp, installedApp);
  } catch (error) {
    if (existsSync(backupApp) && !existsSync(installedApp)) renameSync(backupApp, installedApp);
    throw error;
  }

  console.log("[promote-stable] relaunching…");
  const executable = path.join(installedApp, "Contents", "MacOS", "Workspace");
  const launchStartedAt = Date.now();
  const child = spawn(executable, [], { detached: true, stdio: "ignore", env: getPromotedAppEnvironment() });
  child.unref();
  try {
    if (!child.pid) throw new Error("Workspace did not start");
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 8_000);
      child.once("error", error => { clearTimeout(timeout); reject(error); });
    });
    const startupEvents = readStartupEvents().filter(event => event.pid === child.pid && event.execPath === executable && Date.parse(event.ts) >= launchStartedAt);
    const windowShown = startupEvents.some(event => event.event === "window_revealed");
    const rendererCrashed = startupEvents.some(event => event.event === "webcontents_render_process_gone" && event.reason === "crashed");
    if (!windowShown || rendererCrashed) throw new Error("new Workspace process did not show a healthy window");
  } catch (error) {
    if (existsSync(backupApp)) {
      const failedApp = `${installedApp}.failed-${Date.now()}.app`;
      renameSync(installedApp, failedApp);
      renameSync(backupApp, installedApp);
      console.error(`[promote-stable] restored previous app after relaunch failure; failed build kept at ${failedApp}`);
    }
    throw error;
  }
  console.log(`[promote-stable] launched (${executable})`);
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
    "foreach ($name in @('electron', 'winpty-agent', 'OpenConsole')) {",
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
  console.log("[promote-stable] building Electron app…");
  const build = spawnSync("npm", ["run", "build:win:dir"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);

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
  const child = spawn(activeExe, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: getPromotedAppEnvironment(),
  });
  child.unref();
}

try {
  if (process.platform === "darwin") {
    await promoteMac();
  } else if (process.platform === "win32") {
    promoteWindows();
  } else {
    throw new Error("promote-stable supports macOS and Windows only.");
  }
  console.log("[promote-stable] done.");
} catch (error) {
  console.error(`[promote-stable] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
