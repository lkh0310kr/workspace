#!/usr/bin/env node
/**
 * Copy the built world-engine-electron-embed native module into resources/
 * for electron-builder extraResources / asarUnpack.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(electronDir, "..");
const embedDir = path.join(repoRoot, "native", "world-engine-electron-embed");
const stageDir = path.join(electronDir, "resources", "world-engine-embed");

const MODULE_NAMES =
  process.platform === "win32"
    ? ["world_engine_electron_embed.dll", "world_engine_electron_embed.node"]
    : ["libworld_engine_electron_embed.dylib", "world_engine_electron_embed.node"];

function findBuiltModule(): string | null {
  for (const profile of ["release", "debug"]) {
    for (const name of MODULE_NAMES) {
      const candidate = path.join(embedDir, "target", profile, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const built = findBuiltModule();
fs.mkdirSync(stageDir, { recursive: true });
if (!built) {
  fs.writeFileSync(
    path.join(stageDir, "README.txt"),
    "world-engine-electron-embed not built yet.\r\nRun: cd electron && npm run build:native:embed\r\n",
  );
  console.warn("[stage-world-engine-embed] Skip — native module not found.");
  process.exit(0);
}

const dest = path.join(stageDir, "world_engine_electron_embed.node");
fs.copyFileSync(built, dest);
console.log(`[stage-world-engine-embed] Staged ${dest} from ${built}`);
