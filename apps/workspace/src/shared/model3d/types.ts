/** Workspace-relative asset open intent — see docs/planning/cad-orchestration-phase-plan.md */
export type AssetIntent = "preview" | "place" | "simulate" | "edit";

export type ModelOpenIntent = AssetIntent;

export interface AssetOpenRequest {
  tabId: number;
  relativePath: string;
  intent: ModelOpenIntent;
  source: "tree" | "quick-open" | "agent";
}

/** Orchestration routing target — not an importer implementation. */
export type ImportPipeline =
  | "import-preview"
  | "import-convert"
  | "world-engine-simulate"
  | "external-cad-edit";

export type ImportJobPhase =
  | "queued"
  | "sniffing"
  | "converting"
  | "caching"
  | "ready"
  | "failed";

export interface ImportJob {
  id: string;
  request: AssetOpenRequest;
  pipeline: ImportPipeline;
  phase: ImportJobPhase;
  createdAt: number;
  updatedAt: number;
  manifest?: SceneManifest;
  error?: string;
}

export type DetectedModelFormat =
  | "glb"
  | "gltf"
  | "fbx"
  | "obj"
  | "stl"
  | "ply"
  | "dae"
  | "step"
  | "unknown";

export interface ImportWarning {
  code: string;
  message: string;
}

export type SceneManifest =
  | {
      version: 1;
      status: "ready";
      source: { path: string; format: DetectedModelFormat };
      readStrategy: "blob-preview";
      mimeType: string;
      /** When set (e.g. STEP→glb), the viewer loads this format instead of `source.format`. */
      renderFormat?: DetectedModelFormat;
      warnings: ImportWarning[];
    }
  | {
      version: 1;
      status: "ready";
      source: { path: string; format: DetectedModelFormat };
      readStrategy: "workspace-model";
      modelUrl: string;
      mimeType: string;
      renderFormat?: DetectedModelFormat;
      warnings: ImportWarning[];
    }
  | {
      version: 1;
      status: "unsupported";
      source: { path: string; format: DetectedModelFormat };
      message: string;
      warnings: ImportWarning[];
    };

export class ImportNotReadyError extends Error {
  readonly format: DetectedModelFormat;

  constructor(format: DetectedModelFormat, message?: string) {
    super(message ?? `Import for ${format} is not available yet`);
    this.name = "ImportNotReadyError";
    this.format = format;
  }
}
