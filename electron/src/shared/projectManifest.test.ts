import { describe, it, expect } from "vitest";
import {
  emptyProjectManifest,
  parseProjectManifest,
  upsertProjectApp,
  PROJECT_MANIFEST_SCHEMA_VERSION,
} from "./projectManifest";

describe("emptyProjectManifest", () => {
  it("is an empty apps list at the current schema version", () => {
    expect(emptyProjectManifest()).toEqual({ schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION, apps: [] });
  });
});

describe("parseProjectManifest", () => {
  it("parses a valid manifest", () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      apps: [{ id: "a", kind: "engine-bundle", path: "godot-demo-web", addedAt: 123 }],
    });
    expect(parseProjectManifest(raw)).toEqual({
      schemaVersion: 1,
      apps: [{ id: "a", kind: "engine-bundle", path: "godot-demo-web", addedAt: 123 }],
    });
  });

  it("salvages malformed JSON to an empty manifest instead of throwing", () => {
    expect(parseProjectManifest("not json")).toEqual(emptyProjectManifest());
  });

  it("salvages a schema-invalid object to an empty manifest instead of throwing", () => {
    expect(parseProjectManifest(JSON.stringify({ apps: "not an array" }))).toEqual(emptyProjectManifest());
  });

  it("salvages a single malformed app entry by discarding the whole manifest (fail-closed, not silently drop entries)", () => {
    const raw = JSON.stringify({ schemaVersion: 1, apps: [{ id: "a" }] });
    expect(parseProjectManifest(raw)).toEqual(emptyProjectManifest());
  });
});

describe("upsertProjectApp", () => {
  it("adds a new entry", () => {
    const next = upsertProjectApp(emptyProjectManifest(), {
      id: "a",
      kind: "engine-bundle",
      path: "godot-demo-web",
      addedAt: 100,
    });
    expect(next.apps).toEqual([{ id: "a", kind: "engine-bundle", path: "godot-demo-web", addedAt: 100 }]);
  });

  it("updates (not duplicates) an entry with the same kind+path", () => {
    const first = upsertProjectApp(emptyProjectManifest(), {
      id: "a",
      kind: "engine-bundle",
      path: "godot-demo-web",
      addedAt: 100,
    });
    const second = upsertProjectApp(first, {
      id: "a",
      kind: "engine-bundle",
      path: "godot-demo-web",
      title: "Godot Demo",
      addedAt: 200,
    });
    expect(second.apps).toHaveLength(1);
    expect(second.apps[0]).toEqual({
      id: "a",
      kind: "engine-bundle",
      path: "godot-demo-web",
      title: "Godot Demo",
      addedAt: 200,
    });
  });

  it("treats a different kind at the same path as a distinct entry", () => {
    const first = upsertProjectApp(emptyProjectManifest(), {
      id: "a",
      kind: "engine-bundle",
      path: "shared-dir",
      addedAt: 100,
    });
    const second = upsertProjectApp(first, {
      id: "b",
      kind: "asset-folder",
      path: "shared-dir",
      addedAt: 200,
    });
    expect(second.apps).toHaveLength(2);
  });

  it("defaults addedAt to now when omitted", () => {
    const before = Date.now();
    const next = upsertProjectApp(emptyProjectManifest(), { id: "a", kind: "engine-bundle", path: "p" });
    expect(next.apps[0].addedAt).toBeGreaterThanOrEqual(before);
  });
});
