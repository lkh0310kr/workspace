#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "src", "renderer", "public");

const COPIES = [
  {
    src: join(root, "node_modules/three/examples/jsm/libs/draco/gltf"),
    dest: join(publicDir, "draco"),
  },
  {
    src: join(root, "node_modules/three/examples/jsm/libs/basis"),
    dest: join(publicDir, "basis"),
  },
];

for (const { src, dest } of COPIES) {
  if (!existsSync(src)) {
    console.warn(`skip missing decoder libs: ${src}`);
    continue;
  }
  mkdirSync(publicDir, { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`copied ${dest}`);
}
