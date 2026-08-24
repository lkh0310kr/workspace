// Applies Orca's own xterm.js CompositionHelper rewrite (see
// ref-proj/orca/config/patches/xterm-src/@xterm__xterm@6.1.0-beta.287.src.patch
// for the readable source-level version of this) — a proper, engine-
// agnostic fix for the IME/composition edge cases stock xterm.js
// acknowledges as unsolved (e.g. Korean where an ending consonant can move
// to the following character), not a WKWebView-specific workaround. Copied
// as-is from Orca's compiled-package patch (config/patches/
// @xterm__xterm@6.1.0-beta.287.patch); applies cleanly against
// @xterm/xterm@6.1.0-beta.287 exactly (this project pins that exact
// version for that reason — anything else and the diff context won't
// match).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const patchFile = join(root, "patches", "xterm.orca-upstream.patch");
const marker = join(root, "node_modules", "@xterm", "xterm", ".orca-patch-applied");

if (!existsSync(patchFile)) {
  console.warn("apply-xterm-patch: patches/xterm.orca-upstream.patch not found, skipping");
  process.exit(0);
}
if (existsSync(marker)) {
  process.exit(0);
}

try {
  execFileSync("git", ["apply", "--directory=node_modules/@xterm/xterm", patchFile], {
    cwd: root,
    stdio: "inherit",
  });
  execFileSync("touch", [marker]);
  console.log("apply-xterm-patch: applied Orca's xterm.js composition patch");
} catch (err) {
  console.error("apply-xterm-patch: failed to apply — check @xterm/xterm is pinned to exactly 6.1.0-beta.287");
  console.error(err.message ?? err);
  process.exit(1);
}

