import { describe, it, expect } from "vitest";
import {
  createRect,
  createEllipse,
  findObject,
  updateObject,
  deleteObject,
  flattenObjects,
  serializeDocument,
  parseDocument,
  createBlankDocument,
  type SceneObject,
  type GroupObject,
} from "./sceneGraph";

function group(id: string, children: SceneObject[]): GroupObject {
  return { id, type: "group", children, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 } };
}

describe("createRect / createEllipse", () => {
  it("creates a rect with identity transform and default style", () => {
    const r = createRect(10, 20, 100, 50);
    expect(r.type).toBe("rect");
    expect(r).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
    expect(r.transform).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
  });

  it("creates an ellipse", () => {
    const e = createEllipse(50, 50, 20, 10);
    expect(e).toMatchObject({ type: "ellipse", cx: 50, cy: 50, rx: 20, ry: 10 });
  });

  it("gives each object a unique id", () => {
    const a = createRect(0, 0, 1, 1);
    const b = createRect(0, 0, 1, 1);
    expect(a.id).not.toBe(b.id);
  });
});

describe("findObject / updateObject / deleteObject", () => {
  const leaf = createRect(0, 0, 10, 10);
  const nested = group("g1", [leaf]);
  const tree: SceneObject[] = [nested];

  it("finds a top-level object", () => {
    expect(findObject(tree, "g1")).toBe(nested);
  });

  it("finds an object nested inside a group", () => {
    expect(findObject(tree, leaf.id)).toBe(leaf);
  });

  it("returns null for an unknown id", () => {
    expect(findObject(tree, "missing")).toBeNull();
  });

  it("updateObject replaces a nested object without mutating the original tree", () => {
    const next = updateObject(tree, leaf.id, (obj) => ({ ...obj, id: obj.id }) as SceneObject);
    const updated = updateObject(tree, leaf.id, (obj) =>
      obj.type === "rect" ? { ...obj, width: 999 } : obj,
    );
    expect((findObject(updated, leaf.id) as { width: number }).width).toBe(999);
    // original untouched
    expect((findObject(tree, leaf.id) as { width: number }).width).toBe(10);
    expect(next).not.toBe(tree);
  });

  it("deleteObject removes a nested object", () => {
    const next = deleteObject(tree, leaf.id);
    expect(findObject(next, leaf.id)).toBeNull();
    // group itself survives, now empty
    expect((findObject(next, "g1") as GroupObject).children).toHaveLength(0);
  });
});

describe("flattenObjects", () => {
  it("flattens nested groups depth-first, preserving draw order", () => {
    const a = createRect(0, 0, 1, 1);
    const b = createEllipse(0, 0, 1, 1);
    const c = createRect(1, 1, 1, 1);
    const tree: SceneObject[] = [a, group("g", [b, c])];
    expect(flattenObjects(tree).map((o) => o.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe("serializeDocument / parseDocument", () => {
  it("round-trips a document through JSON", () => {
    const doc = createBlankDocument(400, 300);
    doc.objects.push(createRect(1, 2, 3, 4));
    const json = serializeDocument(doc);
    const parsed = parseDocument(json);
    expect(parsed).toEqual(doc);
  });

  it("throws on an unrecognized format version", () => {
    expect(() => parseDocument(JSON.stringify({ formatVersion: 999, document: {} }))).toThrow();
  });

  it("throws on malformed JSON", () => {
    expect(() => parseDocument("not json")).toThrow();
  });
});
