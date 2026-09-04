import type { AssetIntent, AssetOpenRequest, ImportPipeline } from "./types";

/** Maps user intent to orchestration pipeline — no format sniffing here. */
export function resolvePipelineForIntent(intent: AssetIntent): ImportPipeline {
  switch (intent) {
    case "preview":
    case "place":
      return "import-preview";
    case "simulate":
      return "world-engine-simulate";
    case "edit":
      return "external-cad-edit";
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}

export function normalizeAssetIntent(intent: AssetOpenRequest["intent"]): AssetIntent {
  return intent;
}

export function pipelineForRequest(request: AssetOpenRequest): ImportPipeline {
  return resolvePipelineForIntent(normalizeAssetIntent(request.intent));
}

export function isPreviewPipeline(pipeline: ImportPipeline): boolean {
  return pipeline === "import-preview" || pipeline === "import-convert";
}
