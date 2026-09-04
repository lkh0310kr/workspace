import { describe, expect, it } from "vitest";
import { isPreviewPipeline, resolvePipelineForIntent } from "./orchestration";

describe("orchestration contract", () => {
  it("routes preview and place to import-preview", () => {
    expect(resolvePipelineForIntent("preview")).toBe("import-preview");
    expect(resolvePipelineForIntent("place")).toBe("import-preview");
  });

  it("routes simulate and edit to delegate pipelines", () => {
    expect(resolvePipelineForIntent("simulate")).toBe("world-engine-simulate");
    expect(resolvePipelineForIntent("edit")).toBe("external-cad-edit");
  });

  it("classifies preview pipelines", () => {
    expect(isPreviewPipeline("import-preview")).toBe(true);
    expect(isPreviewPipeline("world-engine-simulate")).toBe(false);
  });
});
