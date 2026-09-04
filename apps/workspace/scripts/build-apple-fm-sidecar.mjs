#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const sidecarDir = join(root, "resources", "japanese", "apple-fm-sidecar");
const binaryPath = join(sidecarDir, "apple-fm-sidecar");

if (process.platform !== "darwin") {
  process.exit(0);
}

const swiftc = spawnSync("xcrun", ["--find", "swiftc"], { encoding: "utf8" });
if (swiftc.status !== 0) {
  console.warn("[apple-fm-sidecar] swiftc not found; skip build");
  process.exit(0);
}

const build = spawnSync(
  "swiftc",
  ["-O", "main.swift", "-o", "apple-fm-sidecar", "-framework", "FoundationModels"],
  { cwd: sidecarDir, stdio: "inherit" },
);

if (build.status !== 0) {
  console.warn("[apple-fm-sidecar] build failed (macOS 26+ SDK / Apple Intelligence required)");
  process.exit(build.status ?? 1);
}

if (existsSync(binaryPath)) {
  console.log(`[apple-fm-sidecar] built ${binaryPath}`);
}
