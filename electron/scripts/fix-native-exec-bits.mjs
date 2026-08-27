// node-pty's prebuilt darwin spawn-helper binary loses its executable bit
// somewhere in npm's tarball-extract / electron-builder's rebuild copy
// path — confirmed empirically (posix_spawnp failed on every pty spawn
// until chmod +x'd). Not chasing the exact extraction step that strips it;
// just restoring the bit unconditionally after every install so it can't
// silently regress local dev again.
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const candidates = [
  "node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
  "node_modules/node-pty/prebuilds/darwin-x64/spawn-helper",
  "node_modules/node-pty/build/Release/spawn-helper",
];

// @vscode/ripgrep's rg binary ships in a platform-specific optionalDependency
// package (@vscode/ripgrep-darwin-arm64, @vscode/ripgrep-linux-x64, etc.) —
// same class of "lost exec bit somewhere in the install/rebuild path" risk
// as node-pty's spawn-helper above, so scan for whichever one actually got
// installed rather than hardcoding every platform/arch combination.
const scopeDir = join(process.cwd(), "node_modules/@vscode");
if (existsSync(scopeDir)) {
  for (const entry of readdirSync(scopeDir)) {
    if (!entry.startsWith("ripgrep-")) continue;
    candidates.push(`node_modules/@vscode/${entry}/bin/rg`);
  }
}

for (const rel of candidates) {
  const p = join(process.cwd(), rel);
  if (existsSync(p)) {
    chmodSync(p, 0o755);
    console.log(`fix-native-exec-bits: chmod +x ${rel}`);
  }
}
