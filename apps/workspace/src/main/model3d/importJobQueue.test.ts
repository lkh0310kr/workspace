import { describe, expect, it } from "vitest";
import { ImportJobQueue } from "./importJobQueue";
import type { SceneManifest } from "../../shared/model3d/types";

const readyManifest: SceneManifest = {
  version: 1,
  status: "ready",
  source: { path: "models/box.glb", format: "glb" },
  readStrategy: "blob-preview",
  mimeType: "model/gltf-binary",
  warnings: [],
};

describe("ImportJobQueue", () => {
  it("progresses queued → ready on success", async () => {
    const queue = new ImportJobQueue();
    const phases: string[] = [];
    queue.on("update", (job) => phases.push(job.phase));

    const job = await queue.enqueue(
      { tabId: 1, relativePath: "models/box.glb", intent: "preview", source: "tree" },
      async () => readyManifest,
    );

    expect(job.phase).toBe("ready");
    expect(job.manifest).toEqual(readyManifest);
    expect(phases).toEqual(["queued", "sniffing", "converting", "caching", "ready"]);
  });

  it("marks job failed when runner throws", async () => {
    const queue = new ImportJobQueue();
    const job = await queue.enqueue(
      { tabId: 1, relativePath: "models/missing.glb", intent: "preview", source: "tree" },
      async () => {
        throw new Error("ENOENT");
      },
    );
    expect(job.phase).toBe("failed");
    expect(job.error).toBe("ENOENT");
  });

  it("failFast creates failed job without running", () => {
    const queue = new ImportJobQueue();
    const job = queue.failFast(
      { tabId: 1, relativePath: "part.step", intent: "edit", source: "tree" },
      "CAD edit delegate not available",
    );
    expect(job.phase).toBe("failed");
    expect(job.pipeline).toBe("external-cad-edit");
  });
});
