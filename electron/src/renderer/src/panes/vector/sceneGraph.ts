// Vector Editor's document model — see docs/architecture/08-vector-editor.md
// for the full design. The scene graph (this file's types) is the source
// of truth; SVG in VectorEditorContent.tsx is a *view* of it, same
// relationship CodeMirror's EditorState has to its DOM elsewhere in this
// app.
//
// M1 scope: Rect and Ellipse only (creation, selection, load/save). Line,
// Path, Text, and Group are typed here to match the full data model
// already agreed in the design doc, but nothing creates or renders them
// yet — later milestones (M2 pen tool, M3 groups, M5 text) implement
// those without changing this file's shape.

export interface ShapeStyle {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
}

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface PathAnchor {
  x: number;
  y: number;
  inHandle?: { x: number; y: number };
  outHandle?: { x: number; y: number };
}

interface BaseObject {
  id: string;
  style: ShapeStyle;
  transform: Transform;
}

export interface RectObject extends BaseObject {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
}

export interface EllipseObject extends BaseObject {
  type: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface LineObject extends BaseObject {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PathObject extends BaseObject {
  type: "path";
  anchors: PathAnchor[];
  closed: boolean;
}

export interface TextObject extends BaseObject {
  type: "text";
  x: number;
  y: number;
  content: string;
  fontSize: number;
  fontFamily: string;
}

export interface GroupObject {
  id: string;
  type: "group";
  children: SceneObject[];
  transform: Transform;
}

export type SceneObject = RectObject | EllipseObject | LineObject | PathObject | TextObject | GroupObject;

export interface VectorDocument {
  id: string;
  width: number;
  height: number;
  background: string;
  objects: SceneObject[];
}

export const DOCUMENT_FORMAT_VERSION = 1;

/** On-disk shape — a thin envelope around VectorDocument so a future
 * format change has somewhere to hang a migration, same idea as
 * PaneGroupConfig.schemaVersion elsewhere in this app. */
export interface VectorFile {
  formatVersion: number;
  document: VectorDocument;
}

export const DEFAULT_STYLE: ShapeStyle = { fill: "#4c9aff", stroke: "#1b1b1f", strokeWidth: 1, opacity: 1 };
export const IDENTITY_TRANSFORM: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };

export function createBlankDocument(width = 800, height = 600): VectorDocument {
  return { id: crypto.randomUUID(), width, height, background: "#ffffff", objects: [] };
}

export function createRect(x: number, y: number, width: number, height: number): RectObject {
  return {
    id: crypto.randomUUID(),
    type: "rect",
    x,
    y,
    width,
    height,
    style: { ...DEFAULT_STYLE },
    transform: { ...IDENTITY_TRANSFORM },
  };
}

export function createEllipse(cx: number, cy: number, rx: number, ry: number): EllipseObject {
  return {
    id: crypto.randomUUID(),
    type: "ellipse",
    cx,
    cy,
    rx,
    ry,
    style: { ...DEFAULT_STYLE },
    transform: { ...IDENTITY_TRANSFORM },
  };
}

export function createLine(x1: number, y1: number, x2: number, y2: number): LineObject {
  return {
    id: crypto.randomUUID(),
    type: "line",
    x1,
    y1,
    x2,
    y2,
    style: { ...DEFAULT_STYLE, fill: null },
    transform: { ...IDENTITY_TRANSFORM },
  };
}

export function createPath(anchors: PathAnchor[], closed: boolean): PathObject {
  return {
    id: crypto.randomUUID(),
    type: "path",
    anchors,
    closed,
    style: { ...DEFAULT_STYLE, fill: closed ? DEFAULT_STYLE.fill : null },
    transform: { ...IDENTITY_TRANSFORM },
  };
}

/** M3 scope: a group's own transform stays translation-only (identity
 * scale/rotation) — see VectorEditorContent.tsx's group/ungroup comments
 * for why that keeps Ungroup's math a plain addition instead of a
 * general affine decomposition. Children keep their own individual
 * transforms unchanged by grouping. */
export function createGroup(children: SceneObject[]): GroupObject {
  return { id: crypto.randomUUID(), type: "group", children, transform: { ...IDENTITY_TRANSFORM } };
}

/** Deep clone with fresh ids everywhere (including a group's children,
 * recursively) — used by duplicate/paste. Two objects can never share an
 * id in the same document, and a group's children need their own ids
 * distinct from the original's, not just the group wrapper. */
export function cloneWithNewIds(obj: SceneObject): SceneObject {
  if (obj.type === "group") {
    return { ...obj, id: crypto.randomUUID(), children: obj.children.map(cloneWithNewIds) };
  }
  return { ...obj, id: crypto.randomUUID() };
}

/** Depth-first flatten, for hit-testing top-to-bottom (last object in the
 * flattened list was drawn last, i.e. is visually on top). */
export function flattenObjects(objects: SceneObject[]): SceneObject[] {
  const out: SceneObject[] = [];
  for (const obj of objects) {
    if (obj.type === "group") out.push(...flattenObjects(obj.children));
    else out.push(obj);
  }
  return out;
}

export function findObject(objects: SceneObject[], id: string): SceneObject | null {
  for (const obj of objects) {
    if (obj.id === id) return obj;
    if (obj.type === "group") {
      const found = findObject(obj.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** Replaces the object with the given id (searching recursively into
 * groups) — returns a new tree, doesn't mutate. */
export function updateObject(
  objects: SceneObject[],
  id: string,
  update: (obj: SceneObject) => SceneObject,
): SceneObject[] {
  return objects.map((obj) => {
    if (obj.id === id) return update(obj);
    if (obj.type === "group") return { ...obj, children: updateObject(obj.children, id, update) };
    return obj;
  });
}

export function deleteObject(objects: SceneObject[], id: string): SceneObject[] {
  return objects
    .filter((obj) => obj.id !== id)
    .map((obj) => (obj.type === "group" ? { ...obj, children: deleteObject(obj.children, id) } : obj));
}

export function serializeDocument(doc: VectorDocument): string {
  const file: VectorFile = { formatVersion: DOCUMENT_FORMAT_VERSION, document: doc };
  return JSON.stringify(file, null, 2);
}

/** Throws on malformed JSON or an unrecognized formatVersion — callers
 * catch and show "couldn't load" rather than rendering a half-valid
 * document. No zod here (unlike layout persistence) since a vector file
 * is user-authored-and-owned, not something a stale/older build's
 * mismatched shape needs graceful salvage for yet — revisit if a real
 * format migration ever happens. */
export function parseDocument(json: string): VectorDocument {
  const parsed = JSON.parse(json) as Partial<VectorFile>;
  if (parsed.formatVersion !== DOCUMENT_FORMAT_VERSION || !parsed.document) {
    throw new Error(`unsupported vector file format: ${String(parsed.formatVersion)}`);
  }
  return parsed.document;
}
