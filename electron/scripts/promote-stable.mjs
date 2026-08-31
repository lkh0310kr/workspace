#!/usr/bin/env node
/**
 * Build the current source and install it as the daily-driver app at
 * /Applications/Workspace.app, replacing whatever's there and relaunching
 * it. No GitHub release, no version bump, no update server — this is a
 * single-machine personal app, so "ship a build" just means "put the new
 * .app where I actually run it from".
 *
 * Only ever touches /Applications/Workspace.app (the packaged
 * productName). `npm run dev` runs unpackaged and gets a distinct
 * "Workspace (Dev)" Dock name — see appSupportDir() in src/main/persistence.ts
 * and the app.setName() call in src/main/index.ts.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, rmSync, cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builtApp = path.join(root, "dist", "mac-arm64", "Workspace.app");
const installedApp = "/Applications/Workspace.app";

if (process.platform !== "darwin") {
  console.error("promote-stable is macOS-only for now (targets /Applications/Workspace.app).");
  process.exit(1);
}

console.log("[promote-stable] building…");
execFileSync("npx", ["electron-vite", "build"], { cwd: root, stdio: "inherit" });
execFileSync("npx", ["electron-builder", "--mac", "--dir"], { cwd: root, stdio: "inherit" });

if (!existsSync(builtApp)) {
  console.error(`[promote-stable] expected build output missing: ${builtApp}`);
  process.exit(1);
}

console.log("[promote-stable] quitting the running stable app, if any…");
try {
  execSync(`pkill -x Workspace`, { stdio: "ignore" });
} catch {
  /* not running */
}

console.log(`[promote-stable] installing to ${installedApp}…`);
rmSync(installedApp, { recursive: true, force: true });
cpSync(builtApp, installedApp, { recursive: true, dereference: false, verbatimSymlinks: true });

console.log("[promote-stable] relaunching…");
execFileSync("open", ["-a", installedApp]);

console.log("[promote-stable] done.");
