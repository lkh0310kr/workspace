import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const FIXTURES = join(import.meta.dirname, "../../../../../test-fixtures/models");

describe("GLTFLoader buffer parse", () => {
  it("parses box.glb without a file extension hint", async () => {
    const file = readFileSync(join(FIXTURES, "box.glb"));
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
      "",
    );

    let meshCount = 0;
    gltf.scene.traverse((obj) => {
      if ((obj as { isMesh?: boolean }).isMesh) meshCount += 1;
    });

    expect(meshCount).toBeGreaterThan(0);
  });
});
