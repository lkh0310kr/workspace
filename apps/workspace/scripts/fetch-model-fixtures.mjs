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
  boxFbx: "https://raw.githubusercontent.com/mrdoob/three.js/r182/examples/models/fbx/vCube.fbx",
  boxGltf:
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Box/glTF/Box.gltf",
  boxBin:
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Box/glTF/Box0.bin",
  boxDracoGltf:
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Box/glTF-Draco/Box.gltf",
  boxDracoBin:
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Box/glTF-Draco/Box0.bin",
};

/** Minimum bytes for a loadable FBX (rejects sniffer header-only stubs). */
export const MIN_LOADABLE_FBX_BYTES = 500;

function writeCubeObj(filePath) {
  const obj = `# cube\nmtllib cube.mtl\no cube\nusemtl mat\ng cube\nv -0.5 -0.5 -0.5\nv 0.5 -0.5 -0.5\nv 0.5 0.5 -0.5\nv -0.5 0.5 -0.5\nv -0.5 -0.5 0.5\nv 0.5 -0.5 0.5\nv 0.5 0.5 0.5\nv -0.5 0.5 0.5\nf 1 2 3 4\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n`;
  fs.writeFileSync(filePath, obj);
}

function writeCubeMtl(filePath) {
  const mtl = `newmtl mat\nKa 0.2 0.2 0.2\nKd 0.8 0.4 0.2\nKs 0.1 0.1 0.1\nNs 32.0\nd 1.0\nillum 2\n`;
  fs.writeFileSync(filePath, mtl);
}

function facet(normal, v1, v2, v3) {
  const [nx, ny, nz] = normal;
  const fmt = (v) => v.map((n) => n.toFixed(1)).join(" ");
  return `  facet normal ${nx} ${ny} ${nz}\n    outer loop\n      vertex ${fmt(v1)}\n      vertex ${fmt(v2)}\n      vertex ${fmt(v3)}\n    endloop\n  endfacet\n`;
}

function writeCubeStl(filePath) {
  const v = [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.5, 0.5, -0.5],
    [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5],
    [0.5, -0.5, 0.5],
    [0.5, 0.5, 0.5],
    [-0.5, 0.5, 0.5],
  ];
  const faces = [
    [[0, 0, -1], v[0], v[1], v[2]],
    [[0, 0, -1], v[0], v[2], v[3]],
    [[0, 0, 1], v[4], v[6], v[5]],
    [[0, 0, 1], v[4], v[7], v[6]],
    [[0, -1, 0], v[0], v[5], v[1]],
    [[0, -1, 0], v[0], v[4], v[5]],
    [[0, 1, 0], v[3], v[2], v[6]],
    [[0, 1, 0], v[3], v[6], v[7]],
    [[-1, 0, 0], v[0], v[3], v[7]],
    [[-1, 0, 0], v[0], v[7], v[4]],
    [[1, 0, 0], v[1], v[5], v[6]],
    [[1, 0, 0], v[1], v[6], v[2]],
  ];
  const body = faces.map(([n, a, b, c]) => facet(n, a, b, c)).join("");
  fs.writeFileSync(filePath, `solid cube\n${body}endsolid cube\n`);
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
  writeCubeMtl(path.join(outDir, "cube.mtl"));
  writeCubeStl(path.join(outDir, "cube.stl"));
  console.log("wrote cube.obj / cube.mtl / cube.stl");

  try {
    await download(SOURCES.duckGlb, path.join(outDir, "duck.glb"));
    await download(SOURCES.boxFbx, path.join(outDir, "box.fbx"));
    const gltfBoxDir = path.join(outDir, "gltf-box");
    const gltfDracoDir = path.join(outDir, "gltf-draco");
    fs.mkdirSync(gltfBoxDir, { recursive: true });
    fs.mkdirSync(gltfDracoDir, { recursive: true });
    await download(SOURCES.boxGltf, path.join(gltfBoxDir, "Box.gltf"));
    await download(SOURCES.boxBin, path.join(gltfBoxDir, "Box0.bin"));
    await download(SOURCES.boxDracoGltf, path.join(gltfDracoDir, "Box.gltf"));
    await download(SOURCES.boxDracoBin, path.join(gltfDracoDir, "Box0.bin"));
  } catch (err) {
    console.warn("remote download skipped:", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
