// Applies Orca's xterm.js patches (composition IME fix + addon compatibility).
// Readable source-level xterm patch: ref-proj/orca/config/patches/xterm-src/
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

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
  try {
    execFileSync("git", ["apply", "--directory=" + packageDir, patchFile], {
      cwd: root,
      stdio: "inherit",
    });
    execFileSync("touch", [marker]);
    console.log(`apply-xterm-patch: applied patch for ${label}`);
  } catch (err) {
    console.error(`apply-xterm-patch: failed to apply ${label}`);
    console.error(err.message ?? err);
    process.exit(1);
  }
}
