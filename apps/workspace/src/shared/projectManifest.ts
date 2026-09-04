import { z } from "zod";

// Project system (Phase 1 foundation — see docs/ROADMAP.md and
// docs/architecture/08-context-modeling.md's Entity section). Scoped
// deliberately small: this is *not* a general document/asset database,
// it's the one concrete gap ROADMAP.md called out — "no per-app document
// registry ... beyond the flexlayout JSON." The flexlayout/PaneGroupConfig
// JSON already tracks exactly what's open in *tabs* right now (and
// restores it on relaunch — see layoutSalvage.ts), but closing a tab
// forgets it entirely; there's no durable "this project includes a Godot
// bundle at X" record independent of whether a tab for it happens to be
// open. That's the actual gap this fills — nothing more yet. No reader/
// UI is built on top of this (write-only for now, from "Open as App" —
// see PaneGroup.tsx's onTreeOpenAsApp); add one only once there's a real
// second consumer, per this project's own "extract after the second
// concrete case" convention.

export const PROJECT_MANIFEST_SCHEMA_VERSION = 1;

// `kind` is a free string, not a closed enum — Domain owns meaning, this
// module doesn't get to define what kinds of apps/documents can exist
// (context-modeling.md's Entity section). "engine-bundle" is just the
// first value anything actually writes.
const ProjectAppEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  path: z.string().min(1),
  title: z.string().optional(),
  addedAt: z.number(),
});
export type ProjectAppEntry = z.infer<typeof ProjectAppEntrySchema>;

const ProjectManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  apps: z.array(ProjectAppEntrySchema),
});
export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;

export function emptyProjectManifest(): ProjectManifest {
  return { schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION, apps: [] };
}

/** Never throws — malformed/missing input salvages to an empty manifest,
 * same philosophy as layoutSalvage.ts (a corrupt project registry
 * shouldn't block opening the project). */
export function parseProjectManifest(raw: string): ProjectManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return emptyProjectManifest();
  }
  const parsed = ProjectManifestSchema.safeParse(json);
  return parsed.success ? parsed.data : emptyProjectManifest();
}

/** Adds or updates an entry, keyed by (kind, path) — re-registering the
 * same bundle refreshes its addedAt/title rather than duplicating it. */
export function upsertProjectApp(
  manifest: ProjectManifest,
  entry: Omit<ProjectAppEntry, "addedAt"> & { addedAt?: number },
): ProjectManifest {
  const addedAt = entry.addedAt ?? Date.now();
  const withoutExisting = manifest.apps.filter((a) => !(a.kind === entry.kind && a.path === entry.path));
  return { ...manifest, apps: [...withoutExisting, { ...entry, addedAt }] };
}
