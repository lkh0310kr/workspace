/**
 * Orca terminal-ime bootstrap (run-terminal-ibus-hangul-e2e.mjs):
 * env → gsettings → ibus-daemon --xim → wait for hangul engine.
 */
import { spawn, spawnSync } from "node:child_process";

const WAIT_MS = 15_000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function applyLinuxImeEnv(env = process.env) {
  if (process.platform !== "linux") return env;
  if (!env.GTK_IM_MODULE) env.GTK_IM_MODULE = "ibus";
  if (!env.QT_IM_MODULE) env.QT_IM_MODULE = "ibus";
  if (!env.XMODIFIERS) env.XMODIFIERS = "@im=ibus";
  if (!env.IBUS_ENABLE_SYNC_MODE) env.IBUS_ENABLE_SYNC_MODE = "1";
  return env;
}

function configureHangulEngine() {
  for (const [key, value] of [
    ["initial-input-mode", "hangul"],
    ["hangul-keyboard", "2"],
  ]) {
    const result = spawnSync(
      "gsettings",
      ["set", "org.freedesktop.ibus.engine.hangul", key, value],
      { encoding: "utf8" },
    );
    if (result.status !== 0 && result.stderr) {
      console.warn(`[linux-ime] gsettings hangul ${key}: ${result.stderr.trim()}`);
    }
  }
  spawnSync(
    "gsettings",
    [
      "set",
      "org.freedesktop.ibus.general",
      "preload-engines",
      "['hangul', 'xkb:us::eng']",
    ],
    { encoding: "utf8" },
  );
}

function ibusEngineQuery() {
  const result = spawnSync("ibus", ["engine"], { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function startIbusDaemon() {
  try {
    const child = spawn(
      "ibus-daemon",
      ["--xim", "-drx", "--panel=disable", "--emoji-extension=disable"],
      { detached: true, stdio: "ignore", env: process.env },
    );
    child.unref();
  } catch {
    // ibus not installed
  }
}

/**
 * @returns {Promise<string|null>} active engine name or null on failure
 */
export async function bootstrapLinuxIme() {
  if (process.platform !== "linux") return null;
  applyLinuxImeEnv();
  configureHangulEngine();

  let engine = ibusEngineQuery();
  if (!engine) {
    startIbusDaemon();
  }

  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const set = spawnSync("ibus", ["engine", "hangul"], { encoding: "utf8" });
    engine = ibusEngineQuery();
    if (engine === "hangul" && set.status === 0) {
      console.error(`[linux-ime] IBus engine: ${engine}`);
      return engine;
    }
    await delay(100);
  }

  console.warn(
    `[linux-ime] timed out selecting hangul (last engine: ${engine ?? "none"})`,
  );
  return engine;
}
