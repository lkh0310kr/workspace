import type { DetectedModelFormat, ImportWarning, SceneManifest } from "./types";

export type ImportTier = "native" | "convert-light" | "convert-heavy" | "delegate";

export interface ImportCapabilities {
  preserves: string[];
  tier: ImportTier;
  packageAware: boolean;
  maxBytesInProcess?: number;
}

export interface ImportContext {
  workspaceRoot: string;
  absolutePath: string;
  relativePath: string;
  packageRoot: string;
  format: DetectedModelFormat;
  signal?: AbortSignal;
}

export interface ImportResult {
  manifest: SceneManifest;
  warnings: ImportWarning[];
}

export interface Importer {
  id: string;
  formats: DetectedModelFormat[];
  capabilities: ImportCapabilities;
  canImport(ctx: ImportContext): Promise<boolean>;
  import(ctx: ImportContext): Promise<ImportResult>;
}
