#!/usr/bin/env node
/**
 * Shared helpers for the project agent-skills Python virtualenv.
 * Cross-platform: macOS, Linux, WSL, Windows.
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
export const AGENTS_DIR = join(ROOT, ".agents");
export const VENV_DIR = join(AGENTS_DIR, ".venv");
export const REQUIREMENTS = join(AGENTS_DIR, "python", "requirements.txt");
export const MIN_PYTHON = [3, 11];

export function venvPython() {
  if (process.platform === "win32") {
    return join(VENV_DIR, "Scripts", "python.exe");
  }
  return join(VENV_DIR, "bin", "python");
}

export function venvExists() {
  return existsSync(venvPython());
}

function parseVersion(text) {
  const match = String(text).trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionOk(version) {
  if (!version) return false;
  if (version[0] !== MIN_PYTHON[0]) return version[0] > MIN_PYTHON[0];
  return version[1] >= MIN_PYTHON[1];
}

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return (result.stdout || "").trim();
}

function probePython(cmd, args) {
  const versionText = runCapture(cmd, [...args, "--version"]);
  const version = parseVersion(versionText);
  if (!versionOk(version)) return null;
  return { cmd, args, versionText, version };
}

function versionScore(version) {
  // Prefer stable 3.12 / 3.11 over very new interpreters cadgen may not ship wheels for yet.
  const [major, minor] = version;
  if (major === 3 && minor === 12) return 100;
  if (major === 3 && minor === 11) return 90;
  if (major === 3 && minor === 13) return 80;
  if (major === 3 && minor >= 14) return 10;
  return 50;
}

/** Find the best system Python >= 3.11 (py launcher on Windows, python3* elsewhere). */
export function findSystemPython() {
  const candidates =
    process.platform === "win32"
      ? [
          ["py", ["-3.12"]],
          ["py", ["-3.11"]],
          ["py", ["-3.13"]],
          ["python", []],
          ["python3", []],
        ]
      : [
          ["python3.12", []],
          ["python3.11", []],
          ["python3.13", []],
          ["python3", []],
          ["python", []],
        ];

  const hits = [];
  for (const [cmd, args] of candidates) {
    const hit = probePython(cmd, args);
    if (hit) hits.push(hit);
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => versionScore(b.version) - versionScore(a.version));
  return hits[0];
}

export function runStatus(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: options.stdio ?? "inherit",
    encoding: options.encoding,
    windowsHide: true,
    ...options,
  });
  return result;
}

export function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${cmd} ${args.join(" ")}`);
  }
}

export function runOrExit(cmd, args, options = {}) {
  try {
    run(cmd, args, options);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

export function venvPackageHint(version) {
  const minor = version?.[1] ?? "";
  if (process.platform === "win32") {
    return "Re-run the Python installer and enable \"pip\" / venv, or: py -3.12 -m venv .agents\\.venv";
  }
  if (process.platform === "darwin") {
    return `brew install python@${minor || "3.12"}`;
  }
  return `sudo apt install python${minor ? `${version[0]}.${minor}` : "3.12"}-venv`;
}

async function downloadFile(url, dest) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  await pipeline(response.body, createWriteStream(dest));
}

/** Create venv; fall back to --without-pip + get-pip.py when ensurepip is missing (common on Debian/WSL). */
export async function createVirtualenv(python) {
  if (existsSync(VENV_DIR)) {
    rmSync(VENV_DIR, { recursive: true, force: true });
  }

  console.log(`Creating virtualenv at ${VENV_DIR}`);
  let result = runStatus(python.cmd, [...python.args, "-m", "venv", VENV_DIR], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status === 0 && venvExists()) {
    return;
  }

  const errText = `${result.stderr || ""}\n${result.stdout || ""}`;
  const needsPipBootstrap =
    /ensurepip|python3-venv|python\d+\.\d+-venv/i.test(errText) || !venvExists();

  if (!needsPipBootstrap) {
    console.error(errText.trim());
    throw new Error(`venv creation failed: ${python.cmd} ${python.args.join(" ")}`);
  }

  console.log("Standard venv failed (ensurepip missing); retrying with --without-pip…");
  if (existsSync(VENV_DIR)) {
    rmSync(VENV_DIR, { recursive: true, force: true });
  }

  result = runStatus(python.cmd, [...python.args, "-m", "venv", "--without-pip", VENV_DIR], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0 || !venvExists()) {
    console.error((result.stderr || result.stdout || "").trim());
    throw new Error(
      `Could not create virtualenv. Install OS venv support:\n  ${venvPackageHint(python.version)}`,
    );
  }

  const tmp = mkdtempSync(join(tmpdir(), "agents-pip-"));
  const getPip = join(tmp, "get-pip.py");
  try {
    console.log("Bootstrapping pip via get-pip.py…");
    await downloadFile("https://bootstrap.pypa.io/get-pip.py", getPip);
    runOrExit(venvPython(), [getPip]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
