#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

if (process.platform !== "darwin") process.exit(0);

const root = process.cwd();
const target = join(root, "node_modules/node-pty/build/Release/spawn-helper");
const candidates = [
  join(root, `node_modules/node-pty/prebuilds/${process.platform}-${process.arch}/spawn-helper`),
  target,
];
const source = candidates.find(existsSync);

if (!source) {
  throw new Error(
    `node-pty spawn-helper is missing for ${process.platform}-${process.arch}; checked: ${candidates.join(", ")}`,
  );
}

if (source !== target) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
chmodSync(target, 0o755);
console.log(`prepare-node-pty-helper: staged ${target}`);
