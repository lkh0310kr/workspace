#!/usr/bin/env node
/**
 * Create .agents/.venv and install Python deps for agent CAD skills.
 * Works on macOS, Linux, WSL, and Windows.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  AGENTS_DIR,
  REQUIREMENTS,
  VENV_DIR,
  createVirtualenv,
  findSystemPython,
  runOrExit,
  venvExists,
  venvPython,
} from "./agents-python-lib.mjs";

function usage() {
  console.log(`Usage: node scripts/agents-python-setup.mjs [options]

Options:
  --skip-playwright   Skip "playwright install chromium" (faster CI / headless)
  --force-recreate    Delete and recreate the virtualenv
  -h, --help          Show this help
`);
}

function parseArgs(argv) {
  const opts = { skipPlaywright: false, forceRecreate: false };
  for (const arg of argv) {
    if (arg === "--skip-playwright") opts.skipPlaywright = true;
    else if (arg === "--force-recreate") opts.forceRecreate = true;
    else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      usage();
      process.exit(1);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!existsSync(REQUIREMENTS)) {
    console.error(`Missing requirements file: ${REQUIREMENTS}`);
    process.exit(1);
  }

  const python = findSystemPython();
  if (!python) {
    console.error(
      "Python 3.11+ not found. Install Python 3.11 or newer, then re-run:\n" +
        "  npm run agents:python:setup\n\n" +
        "Windows: https://www.python.org/downloads/ (check \"Add to PATH\")\n" +
        "macOS:   brew install python@3.12\n" +
        "Ubuntu:  sudo apt install python3.12-venv python3.12",
    );
    process.exit(1);
  }

  console.log(`Using ${python.versionText} (${python.cmd} ${python.args.join(" ")})`);
  if (python.version[0] === 3 && python.version[1] >= 14) {
    console.warn(
      "Warning: Python 3.14+ may lack prebuilt wheels for cadgen; prefer 3.12 if install fails.",
    );
  }

  if (opts.forceRecreate || !venvExists()) {
    await createVirtualenv(python);
  } else {
    console.log(`Reusing virtualenv at ${VENV_DIR}`);
  }

  const vpy = venvPython();
  console.log("Upgrading pip…");
  runOrExit(vpy, ["-m", "pip", "install", "--upgrade", "pip"]);

  console.log(`Installing ${REQUIREMENTS}…`);
  runOrExit(vpy, ["-m", "pip", "install", "-r", REQUIREMENTS]);

  if (!opts.skipPlaywright) {
    console.log("Installing Playwright Chromium (CAD viewer / snapshots)…");
    runOrExit(vpy, ["-m", "playwright", "install", "chromium"]);
  }

  console.log("\nVerifying cadgen (cad skill)…");
  runOrExit(vpy, ["-m", "cadgen.cli", "doctor", join(AGENTS_DIR, "skills", "cad")]);

  console.log(`\nDone. Use:\n  npm run agents:python -- -m cadgen.cli --help\n  ${vpy}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
