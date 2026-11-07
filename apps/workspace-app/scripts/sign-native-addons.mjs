#!/usr/bin/env node
/**
 * macOS: electron-rebuild leaves better-sqlite3 (and other .node addons) with a
 * linker-signed binary that macOS 15+ rejects when Electron dlopen()s them
 * (SIGKILL / CODESIGNING Invalid Page). Re-sign ad-hoc after every rebuild.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

if (process.platform !== "darwin") {
  process.exit(0);
}

const root = process.cwd();
const candidates = [
  "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  "node_modules/better-sqlite3/build/Release/test_extension.node",
  "node_modules/node-pty/build/Release/pty.node",
  "node_modules/node-pty/prebuilds/darwin-arm64/pty.node",
  "node_modules/node-pty/prebuilds/darwin-x64/pty.node",
];

let signed = 0;
for (const rel of candidates) {
  const file = join(root, rel);
  if (!existsSync(file)) continue;
  const result = spawnSync("codesign", ["--force", "--sign", "-", file], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`sign-native-addons: failed to sign ${rel}`);
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(result.status ?? 1);
  }
  console.log(`sign-native-addons: signed ${rel}`);
  signed += 1;
}

if (signed === 0) {
  console.log("sign-native-addons: no native addons found (run npm install / electron-rebuild first)");
}
