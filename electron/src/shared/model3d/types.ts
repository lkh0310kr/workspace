/** Workspace-relative asset open intent — see docs/planning/3d-model-viewer-architecture.md */
export type ModelOpenIntent = "preview" | "edit" | "simulate" | "thumbnail";

export interface AssetOpenRequest {
  tabId: number;
  relativePath: string;
  intent: ModelOpenIntent;
  source: "tree" | "quick-open" | "agent";
}

export type DetectedModelFormat =
  | "glb"
  | "gltf"
  | "fbx"
  | "obj"
  | "stl"
  | "ply"
  | "dae"
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
      /** Renderer loads bytes via readFileBinaryPreview (v1). */
      readStrategy: "blob-preview";
      mimeType: string;
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
