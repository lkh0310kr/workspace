import type { Importer } from "../../shared/model3d/importer";
import type { DetectedModelFormat } from "../../shared/model3d/types";
import { gltfNativeImporter } from "./importers/gltfNative";
import { stubImporter } from "./importers/stub";

const IMPORTERS: Importer[] = [gltfNativeImporter, stubImporter];

export function listImporters(): readonly Importer[] {
  return IMPORTERS;
}

export function findImporter(format: DetectedModelFormat): Importer | null {
  return IMPORTERS.find((importer) => importer.formats.includes(format)) ?? null;
}
