// node-pty's prebuilt darwin spawn-helper binary loses its executable bit
// somewhere in npm's tarball-extract / electron-builder's rebuild copy
// path — confirmed empirically (posix_spawnp failed on every pty spawn
// until chmod +x'd). Not chasing the exact extraction step that strips it;
// just restoring the bit unconditionally after every install so it can't
// silently regress local dev again.
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

const candidates = [
  "node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
  "node_modules/node-pty/prebuilds/darwin-x64/spawn-helper",
  "node_modules/node-pty/build/Release/spawn-helper",
];

for (const rel of candidates) {
  const p = join(process.cwd(), rel);
  if (existsSync(p)) {
    chmodSync(p, 0o755);
    console.log(`fix-native-exec-bits: chmod +x ${rel}`);
  }
}
