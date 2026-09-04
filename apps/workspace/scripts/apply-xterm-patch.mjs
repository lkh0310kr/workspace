// Applies Orca's xterm.js patches (composition IME fix + addon compatibility).
// Readable source-level xterm patch: ref-proj/orca/config/patches/xterm-src/
import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();

// Patches checked out on /mnt/c (Windows) often have CRLF. `git apply` then
// fails against LF node_modules contents — normalize to LF before applying.
function patchFileForApply(patchFile) {
  const raw = readFileSync(patchFile);
  if (!raw.includes(0x0d)) return patchFile;
  const dir = mkdtempSync(join(tmpdir(), "orca-patch-"));
  const normalized = join(dir, "patch");
  writeFileSync(
    normalized,
    Buffer.from(raw.toString("latin1").replaceAll("\r", ""), "latin1"),
  );
  return { path: normalized, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// `git apply --directory=<dir>` silently no-ops (exit 0, "0 files changed",
// no error) when run from a subdirectory of a larger repo — it filters hunks
// by repo-root-relative path before the --directory prefix is applied, so
// paths that are clearly inside cwd look "outside" and get skipped. Run from
// the repo toplevel instead and fold cwd's prefix into --directory so the
// paths line up. See: electron/ is a subdir of the workspace repo, not its
// own repo root.
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const repoPrefix = execFileSync("git", ["rev-parse", "--show-prefix"], {
  cwd: root,
  encoding: "utf8",
}).trim();

const patches = [
  {
    packageDir: "node_modules/@xterm/xterm",
    patchFile: join(root, "patches", "xterm.orca-upstream.patch"),
    marker: join(root, "node_modules", "@xterm", "xterm", ".orca-patch-applied"),
    label: "@xterm/xterm",
  },
  {
    packageDir: "node_modules/@xterm/addon-webgl",
    patchFile: join(root, "patches", "@xterm__addon-webgl@0.20.0-beta.286.patch"),
    marker: join(root, "node_modules", "@xterm", "addon-webgl", ".orca-patch-applied"),
    label: "@xterm/addon-webgl",
  },
  {
    packageDir: "node_modules/@xterm/addon-serialize",
    patchFile: join(root, "patches", "@xterm__addon-serialize@0.15.0-beta.287.patch"),
    marker: join(root, "node_modules", "@xterm", "addon-serialize", ".orca-patch-applied"),
    label: "@xterm/addon-serialize",
  },
  {
    packageDir: "node_modules/@xterm/addon-ligatures",
    patchFile: join(root, "patches", "@xterm__addon-ligatures@0.11.0-beta.287.patch"),
    marker: join(root, "node_modules", "@xterm", "addon-ligatures", ".orca-patch-applied"),
    label: "@xterm/addon-ligatures",
  },
  {
    packageDir: "node_modules/node-pty",
    patchFile: join(root, "patches", "node-pty@1.1.0.patch"),
    marker: join(root, "node_modules", "node-pty", ".orca-patch-applied"),
    label: "node-pty",
  },
];

for (const { packageDir, patchFile, marker, label } of patches) {
  if (!existsSync(patchFile)) {
    console.warn(`apply-xterm-patch: ${patchFile} not found, skipping ${label}`);
    continue;
  }
  if (existsSync(marker)) {
    continue;
  }
  if (!existsSync(packageDir)) {
    console.warn(`apply-xterm-patch: ${packageDir} not found, skipping ${label}`);
    continue;
  }
  let cleanup = null;
  try {
    const prepared = patchFileForApply(patchFile);
    const applyPath = typeof prepared === "string" ? prepared : prepared.path;
    cleanup = typeof prepared === "string" ? null : prepared.cleanup;
    const applyArgs = ["apply", "--directory=" + repoPrefix + packageDir, applyPath];
    // git apply exits 0 even when every hunk is silently skipped (e.g. a
    // path-scoping mismatch) — check the file count before trusting success.
    const stat = execFileSync("git", [...applyArgs, "--stat"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (/^0 files changed/m.test(stat.trim()) || stat.trim() === "") {
      throw new Error(`git apply matched 0 files for ${label} (patch silently skipped)`);
    }
    execFileSync("git", applyArgs, {
      cwd: repoRoot,
      stdio: "inherit",
    });
    closeSync(openSync(marker, "w"));
    console.log(`apply-xterm-patch: applied patch for ${label}`);
  } catch (err) {
    console.error(`apply-xterm-patch: failed to apply ${label}`);
    console.error(err.message ?? err);
    process.exit(1);
  } finally {
    cleanup?.();
  }
}
