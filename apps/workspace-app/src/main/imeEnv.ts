import { spawn, spawnSync } from "node:child_process";

const WAIT_MS = 15_000;

/**
 * Orca terminal-ime env (ref-proj/orca run-terminal-ibus-hangul-e2e.mjs).
 * Applied before `require('electron')` via banner + with-linux-ime.mjs.
 */
if (process.platform === "linux") {
  if (!process.env.GTK_IM_MODULE) process.env.GTK_IM_MODULE = "ibus";
  if (!process.env.QT_IM_MODULE) process.env.QT_IM_MODULE = "ibus";
  if (!process.env.XMODIFIERS) process.env.XMODIFIERS = "@im=ibus";
  if (!process.env.IBUS_ENABLE_SYNC_MODE) process.env.IBUS_ENABLE_SYNC_MODE = "1";
}

function configureHangulGsettings(): void {
  for (const [key, value] of [
    ["initial-input-mode", "hangul"],
    ["hangul-keyboard", "2"],
  ] as const) {
    try {
      spawnSync(
        "gsettings",
        ["set", "org.freedesktop.ibus.engine.hangul", key, value],
        { stdio: "ignore" },
      );
    } catch {
      /* optional until setup-linux-ime.sh */
    }
  }
  try {
    spawnSync(
      "gsettings",
      [
        "set",
        "org.freedesktop.ibus.general",
        "preload-engines",
        "['hangul', 'xkb:us::eng']",
      ],
      { stdio: "ignore" },
    );
  } catch {
    /* optional */
  }
}

function readIbusEngine(): string | null {
  try {
    const out = spawnSync("ibus", ["engine"], { encoding: "utf8" });
    if (out.status !== 0) return null;
    return out.stdout.trim() || null;
  } catch {
    return null;
  }
}

function startIbusDaemon(): void {
  try {
    spawn("ibus-daemon", ["--xim", "-drx", "--panel=disable", "--emoji-extension=disable"], {
      detached: true,
      stdio: "ignore",
      env: process.env,
    }).unref();
  } catch {
    /* ibus not on PATH */
  }
}

function waitForHangulEngine(): string | null {
  configureHangulGsettings();
  if (!readIbusEngine()) {
    startIbusDaemon();
  }

  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    try {
      spawnSync("ibus", ["engine", "hangul"], { stdio: "ignore" });
    } catch {
      /* retry */
    }
    const engine = readIbusEngine();
    if (engine === "hangul") return engine;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  return readIbusEngine();
}

/**
 * Runtime fallback if dev was not launched via with-linux-ime.mjs.
 */
export function ensureLinuxImeDaemon(): string | null {
  if (process.platform !== "linux") return null;
  return waitForHangulEngine();
}

/**
 * Keys that must never be swallowed by before-input shortcut handlers.
 */
export function isImeToggleKey(input: {
  key?: string;
  code?: string;
  keyCode?: number;
}): boolean {
  const key = input.key ?? "";
  const code = input.code ?? "";
  if (input.keyCode === 21 || input.keyCode === 25) return true;
  return (
    key === "HangulMode" ||
    key === "HanjaMode" ||
    key === "AltGraph" ||
    code === "Lang1" ||
    code === "Lang2" ||
    code === "Convert" ||
    code === "NonConvert"
  );
}
