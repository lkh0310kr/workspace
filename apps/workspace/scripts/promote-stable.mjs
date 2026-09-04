#!/usr/bin/env node
/**
 * Build the current source and install it as the daily-driver app, then relaunch.
 *
 * - macOS: /Applications/Workspace.app
 * - Windows: %LOCALAPPDATA%\Programs\Workspace (unpacked electron-builder output)
 *
 * No GitHub release, no version bump, no update server — single-machine personal app.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, rmSync, cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function stopInstalledWindowsApp(installDir) {
  const ps = [
    "$install = " + JSON.stringify(installDir),
    "Get-Process electron -ErrorAction SilentlyContinue |",
    "  Where-Object { $_.Path -and $_.Path.StartsWith($install, [System.StringComparison]::OrdinalIgnoreCase) } |",
    "  Stop-Process -Force",
  ].join(" ");
  spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
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
  stopInstalledWindowsApp(installDir);

  console.log(`[promote-stable] installing to ${installDir}…`);
  rmSync(installDir, { recursive: true, force: true });
  cpSync(builtDir, installDir, { recursive: true });

  console.log("[promote-stable] relaunching…");
  spawnSync(installedExe, [], { detached: true, stdio: "ignore" });
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
