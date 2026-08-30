#!/usr/bin/env node
/**
 * Download Godot 4.3 (Linux/macOS) + Web export templates into electron/.tools/godot/
 * when the `godot` CLI is not on PATH. Matches test-fixtures/godot-demo (4.3).
 */
import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELECTRON_ROOT = join(__dirname, "..");
const TOOLS_DIR = join(ELECTRON_ROOT, ".tools", "godot");
const GODOT_VERSION = "4.3-stable";
const GODOT_VERSION_DIR = "4.3.stable";

const PLATFORM = process.platform;
const ARCH = process.arch;

function godotAssetNames() {
  if (PLATFORM === "linux" && (ARCH === "x64" || ARCH === "amd64")) {
    return {
      binaryZip: `Godot_v${GODOT_VERSION}_linux.x86_64.zip`,
      binaryName: `Godot_v${GODOT_VERSION}_linux.x86_64`,
      templates: `Godot_v${GODOT_VERSION}_export_templates.tpz`,
    };
  }
  if (PLATFORM === "darwin" && (ARCH === "arm64" || ARCH === "x64")) {
    const macArch = ARCH === "arm64" ? "arm64" : "x86_64";
    return {
      binaryZip: `Godot_v${GODOT_VERSION}_macos.universal.zip`,
      binaryName: `Godot.app/Contents/MacOS/Godot`,
      templates: `Godot_v${GODOT_VERSION}_export_templates.tpz`,
      macArch,
    };
  }
  return null;
}

function releaseUrl(fileName) {
  return `https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}/${fileName}`;
}

async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  if (!response.body) throw new Error(`Empty response: ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

function unzip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const result = spawnSync("unzip", ["-o", zipPath, "-d", destDir], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`unzip failed for ${zipPath}`);
  }
}

function unzipTpz(tpzPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const result = spawnSync("unzip", ["-o", tpzPath, "-d", destDir], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`unzip failed for export templates ${tpzPath}`);
  }
}

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function flattenTemplatesDir(templatesRoot) {
  const versionFile = join(templatesRoot, "version.txt");
  if (existsSync(versionFile)) return;

  const nestedTemplates = join(templatesRoot, "templates");
  if (existsSync(join(nestedTemplates, "version.txt"))) {
    for (const name of readdirSync(nestedTemplates)) {
      spawnSync("mv", [join(nestedTemplates, name), join(templatesRoot, name)], {
        stdio: "inherit",
      });
    }
    rmSync(nestedTemplates, { recursive: true, force: true });
    return;
  }

  const entries = readdirSync(templatesRoot, { withFileTypes: true });
  const nested = entries.find((e) => e.isDirectory() && e.name.includes("4.3"));
  if (nested) {
    const nestedPath = join(templatesRoot, nested.name);
    for (const name of readdirSync(nestedPath)) {
      spawnSync("mv", [join(nestedPath, name), join(templatesRoot, name)], { stdio: "inherit" });
    }
    rmSync(nestedPath, { recursive: true, force: true });
  }
}

function templatesInstalled(templatesRoot) {
  return existsSync(join(templatesRoot, "web_nothreads_release.zip"));
}

async function main() {
  const assets = godotAssetNames();
  if (!assets) {
    console.error(`ensure-godot: unsupported platform ${PLATFORM}/${ARCH}`);
    process.exit(1);
  }

  mkdirSync(TOOLS_DIR, { recursive: true });
  const binaryPath =
    PLATFORM === "darwin"
      ? join(TOOLS_DIR, assets.binaryName)
      : join(TOOLS_DIR, assets.binaryName);

  if (!isExecutable(binaryPath)) {
    const zipPath = join(TOOLS_DIR, assets.binaryZip);
    console.log(`Downloading ${assets.binaryZip}…`);
    await download(releaseUrl(assets.binaryZip), zipPath);
    const extractDir = join(TOOLS_DIR, "_extract");
    rmSync(extractDir, { recursive: true, force: true });
    unzip(zipPath, extractDir);
    if (PLATFORM === "linux") {
      const extracted = join(extractDir, assets.binaryName);
      spawnSync("mv", [extracted, binaryPath], { stdio: "inherit" });
    } else {
      const appSrc = join(extractDir, "Godot.app");
      const appDest = join(TOOLS_DIR, "Godot.app");
      rmSync(appDest, { recursive: true, force: true });
      spawnSync("mv", [appSrc, appDest], { stdio: "inherit" });
    }
    rmSync(extractDir, { recursive: true, force: true });
    chmodSync(binaryPath, 0o755);
    console.log(`Installed ${binaryPath}`);
  } else {
    console.log(`Godot binary already present: ${binaryPath}`);
  }

  const templatesRoot = join(homedir(), ".local", "share", "godot", "export_templates", GODOT_VERSION_DIR);
  flattenTemplatesDir(templatesRoot);
  if (!templatesInstalled(templatesRoot)) {
    const tpzPath = join(TOOLS_DIR, assets.templates);
    console.log(`Downloading ${assets.templates}…`);
    await download(releaseUrl(assets.templates), tpzPath);
    rmSync(templatesRoot, { recursive: true, force: true });
    unzipTpz(tpzPath, templatesRoot);
    flattenTemplatesDir(templatesRoot);
    if (!templatesInstalled(templatesRoot)) {
      throw new Error(`Export templates install failed (missing web_nothreads_release.zip in ${templatesRoot})`);
    }
    console.log(`Installed export templates to ${templatesRoot}`);
  } else {
    console.log(`Export templates already present: ${templatesRoot}`);
  }

  console.log(`\nSet for this shell: export WORKSPACE_GODOT_PATH=${binaryPath}`);
  console.log("Or run export via npm: npm run godot:export:demo");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
