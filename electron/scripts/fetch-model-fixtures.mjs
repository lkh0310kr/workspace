#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test-fixtures", "models");

const SOURCES = {
  duckGlb:
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb",
  boxFbx:
    "https://raw.githubusercontent.com/assimp/assimp/master/test/models/FBX/box.FBX",
};

function writeCubeObj(filePath) {
  const obj = `# cube\no cube\nv -0.5 -0.5 -0.5\nv 0.5 -0.5 -0.5\nv 0.5 0.5 -0.5\nv -0.5 0.5 -0.5\nv -0.5 -0.5 0.5\nv 0.5 -0.5 0.5\nv 0.5 0.5 0.5\nv -0.5 0.5 0.5\nf 1 2 3 4\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n`;
  fs.writeFileSync(filePath, obj);
}

function writeCubeStl(filePath) {
  const stl = `solid cube\n  facet normal 0 0 -1\n    outer loop\n      vertex -0.5 -0.5 -0.5\n      vertex 0.5 -0.5 -0.5\n      vertex 0.5 0.5 -0.5\n    endloop\n  endfacet\n  facet normal 0 0 -1\n    outer loop\n      vertex -0.5 -0.5 -0.5\n      vertex 0.5 0.5 -0.5\n      vertex -0.5 0.5 -0.5\n    endloop\n  endfacet\nendsolid cube\n`;
  fs.writeFileSync(filePath, stl);
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`wrote ${path.basename(dest)} (${buf.length} bytes)`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const boxSrc = path.join(root, "test-fixtures", "world-engine-mesh-demo", "box.glb");
  const boxDest = path.join(outDir, "box.glb");
  if (fs.existsSync(boxSrc)) {
    fs.copyFileSync(boxSrc, boxDest);
    console.log("copied box.glb");
  }

  writeCubeObj(path.join(outDir, "cube.obj"));
  writeCubeStl(path.join(outDir, "cube.stl"));
  console.log("wrote cube.obj / cube.stl");

  fs.writeFileSync(path.join(outDir, "box.fbx"), Buffer.from("Kaydara FBX Binary  \0", "ascii"));
  console.log("wrote box.fbx (minimal sniffer fixture)");

  try {
    await download(SOURCES.duckGlb, path.join(outDir, "duck.glb"));
  } catch (err) {
    console.warn("remote download skipped:", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
