import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react";
import { listDir, readFile, writeFile } from "../electron";
import { Tooltip } from "../components/Tooltip";
import { anchorsToPathData, mirroredHandle } from "./vector/bezierPath";
import {
  BringForwardIcon,
  BringToFrontIcon,
  DownloadIcon,
  EllipseIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  GroupIcon,
  LineIcon,
  PenIcon,
  RectIcon,
  RedoIcon,
  SaveIcon,
  SelectIcon,
  SendBackwardIcon,
  SendToBackIcon,
  TextIcon,
  UndoIcon,
  UngroupIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ZoomToSelectionIcon,
} from "./vector/icons";
import {
  cloneWithNewIds,
  createBlankDocument,
  createEllipse,
  createGroup,
  createLine,
  createPath,
  createRect,
  createText,
  parseDocument,
  serializeDocument,
  type EllipseObject,
  type LineObject,
  type PathAnchor,
  type RectObject,
  type SceneObject,
  type ShapeStyle,
  type TextObject,
  type VectorDocument,
} from "./vector/sceneGraph";
import {
  boundsIntersect,
  boundsUnion,
  documentBounds,
  documentCorners,
  handleLocalPoint,
  localBounds,
  moveBy,
  resizeTransform,
  documentCenter,
  pointerAngleDegrees,
  rotationFromDrag,
  svgTransform,
  toDocumentPoint,
  type Bounds,
  type HandleId,
  type Point,
  type TransformableObject,
} from "./vector/vectorTransform";
import { emptyHistory, pushHistory, undo as undoHistory, redo as redoHistory, canUndo, canRedo, type VectorHistory } from "./vector/vectorHistory";
import { documentToSvg } from "./vector/svgExport";

// Vector Editor pane (see docs/architecture/08-vector-editor.md). M1:
// Rect/Ellipse, single-selection, move/resize/rotate, save/load as plain
// JSON. M2: pen tool (Path), Line tool. M3: stroke/fill UI, groups. M4:
// undo/redo, export SVG/PNG, delete/duplicate/copy-paste/nudge. M5 (this
// file now): Text tool — click to place, content/font-size edited in the
// inspector panel rather than inline-on-canvas (see the design doc's M5
// scope note for why). All five build-order milestones are now in.
interface Props {
  tabId: number;
  filePath: string | null;
  onAssignPath: (path: string) => void;
  treeOpen: boolean;
  onToggleTree: () => void;
}

type Tool = "select" | "rect" | "ellipse" | "line" | "pen" | "text";

// move/resize/rotate all carry the target object's id directly rather
// than relying on the `selectedId` React state closure — the window-level
// mousemove/mouseup listeners below are registered once at drag-start
// (see startDrag) and would otherwise see a one-render-stale selectedId
// if a shape is clicked-and-immediately-dragged in one gesture (selecting
// it and starting the move happen in the same synchronous handler, before
// React re-renders).
type DragMode =
  | { kind: "move"; id: string; startDocPoint: Point; startTransform: TransformableObject["transform"] }
  | { kind: "resize"; id: string; handle: HandleId }
  | { kind: "rotate"; id: string; startAngle: number; startRotation: number }
  | { kind: "draw"; tool: "rect" | "ellipse" | "line"; startDocPoint: Point }
  // Pulling a bezier handle out of the anchor just placed by the pen
  // tool's last click — distinct from "draw" because releasing the mouse
  // here doesn't finish the path (only Enter / clicking near the first
  // anchor does); the pen session (penAnchors) stays open for the next
  // click.
  | { kind: "pen-anchor" }
  // Rubber-band select on empty canvas — a click-without-drag here (see
  // onPointerUp) clears the selection instead of selecting an empty set,
  // same "accidental click" distinction draw/pen already make.
  | { kind: "marquee"; startDocPoint: Point }
  // Space-held (or middle-mouse) drag-to-pan. `scale` is client-px per
  // doc-unit at drag start (svg.getScreenCTM().a) — captured once so the
  // whole drag converts client-pixel deltas to doc-space consistently,
  // instead of re-deriving it from a viewBox that's changing under the
  // drag itself.
  | { kind: "pan"; startClientPoint: Point; startPan: Point; scale: number };

const RESIZE_HANDLES: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const ROTATE_HANDLE_OFFSET = 24; // doc-space px above the "n" handle
const PEN_CLOSE_THRESHOLD = 8; // doc-space px — click near the first anchor to close
const PEN_HANDLE_MIN_DRAG = 2; // doc-space px — below this, treat as a plain corner click
const TOOL_SHORTCUTS: Record<string, Tool> = { v: "select", r: "rect", o: "ellipse", l: "line", p: "pen", t: "text" };
const DUPLICATE_OFFSET = 12; // doc-space px — offset applied to duplicate/paste so the copy isn't hidden directly under the original
const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 10; // held with Shift
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 16;
const ZOOM_STEP = 1.2; // multiplier per zoom-in/out click
const ZOOM_WHEEL_SENSITIVITY = 0.01; // exp(-deltaY * this) per wheel tick, ctrl/cmd+wheel

async function findAvailableUntitledVectorName(tabId: number): Promise<string> {
  return findAvailableUntitledExportName(tabId, "vec.json");
}

async function findAvailableUntitledExportName(tabId: number, ext: string): Promise<string> {
  const entries = await listDir(tabId, "").catch(() => []);
  const names = new Set(entries.filter((e) => !e.is_dir).map((e) => e.name.toLowerCase()));
  if (!names.has(`untitled.${ext}`)) return `untitled.${ext}`;
  let i = 1;
  while (names.has(`untitled ${i}.${ext}`)) i++;
  return `untitled ${i}.${ext}`;
}

// Every SceneObject variant is a TransformableObject now (Text joined in
// M5) — see vector/vectorTransform.ts's isSceneObjectTransformable.
function isTransformable(obj: SceneObject): obj is TransformableObject {
  return !!obj;
}

type DraftShape = RectObject | EllipseObject | LineObject;

export function VectorEditorContent({ tabId, filePath, onAssignPath, treeOpen, onToggleTree }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [doc, setDoc] = useState<VectorDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Multi-select (shift-click) is only for building a set to Group — see
  // this file's onShapeMouseDown/commitGroup. Once 2+ are grouped into
  // one GroupObject, that group is a single object like any other and
  // goes through the ordinary single-selection move/resize/rotate path.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>("select");
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  // In-progress pen path — a click appends an anchor, Enter/click-near-
  // first-anchor commits it as a real PathObject. Empty array = no pen
  // session active.
  const [penAnchors, setPenAnchors] = useState<PathAnchor[]>([]);
  const [penPreviewPoint, setPenPreviewPoint] = useState<Point | null>(null);
  const [history, setHistory] = useState<VectorHistory>(emptyHistory());
  // Viewport — session-local, not persisted into VectorDocument/.vec.json
  // (matches this doc's own scope note: no reason a saved file should pin
  // whatever pan/zoom someone happened to leave it at). `zoom` is a single
  // scalar applied to both width/height (viewBox always keeps the
  // document's own aspect ratio — see resetView/zoomToSelection below for
  // why that's a deliberate simplification, not an oversight).
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [marqueeRect, setMarqueeRect] = useState<Bounds | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const docRef = useRef(doc);
  docRef.current = doc;
  const pathRef = useRef(filePath);
  pathRef.current = filePath;
  const lastLoadedRef = useRef<string | null>(null);
  const onAssignPathRef = useRef(onAssignPath);
  onAssignPathRef.current = onAssignPath;
  const dragRef = useRef<DragMode | null>(null);
  // window-level mousemove/mouseup listeners are registered once per drag
  // (see startDrag) — their closure is fixed at that moment. onPointerUp
  // needs the *final* draft shape once drawing ends, which was built up
  // by many onPointerMove calls (each with their own render) after
  // startDrag ran — a ref keeps that read fresh instead of one-render-stale.
  // (move/resize/rotate don't have this problem: DragMode carries the
  // target object's id directly, set synchronously at drag-start.)
  const draftRef = useRef<DraftShape | null>(draft);
  draftRef.current = draft;
  const penAnchorsRef = useRef(penAnchors);
  penAnchorsRef.current = penAnchors;
  // Same staleness reason as draftRef above — marqueeRect is built up by
  // onPointerMove calls after startDrag's closure was fixed.
  const marqueeRectRef = useRef(marqueeRect);
  marqueeRectRef.current = marqueeRect;
  const historyRef = useRef(history);
  historyRef.current = history;
  // The document as it was right *before* the drag/gesture currently in
  // progress — captured once at gesture-start (startDrag, or the style
  // inspector's first onChange of a session), consumed once at gesture-
  // end to push exactly one history entry per completed gesture instead
  // of one per intermediate frame. See vectorHistory.ts's header comment.
  const gestureBeforeRef = useRef<VectorDocument | null>(null);
  // Whether shift was held when the current marquee drag started — read by
  // onPointerUp (a useCallback whose deps don't include the mousedown
  // event) to decide add-to-selection vs replace-selection.
  const marqueeShiftRef = useRef(false);

  const pushHistoryEntry = useCallback((before: VectorDocument | null, after: VectorDocument | null) => {
    if (!before || !after) return;
    setHistory((h) => pushHistory(h, before, after));
  }, []);

  useEffect(() => {
    setError(null);
    setSelectedIds(new Set());
    setDirty(false);
    setDraft(null);
    setPenAnchors([]);
    setPenPreviewPoint(null);
    setHistory(emptyHistory());
    if (!filePath) {
      const blank = createBlankDocument();
      lastLoadedRef.current = null;
      setDoc(blank);
      return;
    }
    let cancelled = false;
    readFile(tabId, filePath)
      .then((content) => {
        if (cancelled) return;
        const parsed = parseDocument(content);
        lastLoadedRef.current = content;
        setDoc(parsed);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to load vector file");
      });
    return () => {
      cancelled = true;
    };
  }, [tabId, filePath]);

  const commitDoc = useCallback((next: VectorDocument) => {
    setDoc(next);
    setDirty(lastLoadedRef.current !== serializeDocument(next));
  }, []);

  const save = useCallback(async () => {
    const current = docRef.current;
    if (!current) return;
    const content = serializeDocument(current);
    const path = pathRef.current ?? (await findAvailableUntitledVectorName(tabId));
    await writeFile(tabId, path, content);
    lastLoadedRef.current = content;
    setDirty(false);
    if (!pathRef.current) onAssignPathRef.current(path);
  }, [tabId]);

  // SVG is text, so it writes into the workspace through the same IPC as
  // the project file itself — no new backend surface needed. Named after
  // the project file (myfile.vec.json -> myfile.svg) when one exists.
  const exportSvg = useCallback(async () => {
    const current = docRef.current;
    if (!current) return;
    const svg = documentToSvg(current);
    const base = pathRef.current?.replace(/\.vec\.json$/, "").replace(/\.[^./]+$/, "") ?? null;
    const name = base ? `${base}.svg` : await findAvailableUntitledExportName(tabId, "svg");
    await writeFile(tabId, name, svg);
  }, [tabId]);

  // PNG is binary — fs:write-file's IPC only carries text, and adding a
  // binary-write channel just for this isn't justified yet. Uses a
  // regular browser-style download instead (rasterize via an offscreen
  // canvas, trigger a save through Electron's own default download
  // handling) rather than the workspace-relative write the rest of this
  // pane uses.
  const exportPng = useCallback(async () => {
    const current = docRef.current;
    if (!current) return;
    const svg = documentToSvg(current);
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("failed to rasterize SVG for PNG export"));
        img.src = svgUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = current.width;
      canvas.height = current.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, current.width, current.height);
      const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!pngBlob) return;
      const base = pathRef.current?.split("/").pop()?.replace(/\.vec\.json$/, "").replace(/\.[^./]+$/, "") ?? "untitled";
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `${base}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PNG export failed");
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  // Space-held tracking for pan (see startDrag's "pan" mode and
  // onCanvasMouseDown below) — drives the pan cursor affordance too, so
  // it's real state rather than a ref.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceHeld(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const clientToDocPoint = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);

  const replaceObject = useCallback(
    (id: string, next: SceneObject) => {
      const current = docRef.current;
      if (!current) return;
      commitDoc({ ...current, objects: current.objects.map((o) => (o.id === id ? next : o)) });
    },
    [commitDoc],
  );

  const selectedObjects = doc ? doc.objects.filter((o) => selectedIds.has(o.id)) : [];
  const selectedTransformableObjects = selectedObjects.filter(isTransformable);
  // Full move/resize/rotate handles + the stroke/fill inspector only make
  // sense for exactly one selection — 2+ shows a combined outline only
  // (see the render section) until grouped into one real object.
  const selectedObject = selectedObjects.length === 1 ? selectedObjects[0] : null;
  const selectedTransformable =
    selectedObject && isTransformable(selectedObject) ? selectedObject : null;
  // Groups (M3) and Text (M5) don't get resize/rotate handles — move-drag
  // still works for them via the ordinary path (see createGroup's and
  // createText's doc comments / vectorTransform.ts's TransformableObject
  // comment for why).
  const selectedResizable =
    selectedTransformable && selectedTransformable.type !== "group" && selectedTransformable.type !== "text"
      ? selectedTransformable
      : null;
  // Stroke/fill inspector — anything with a `style` field, i.e. not a
  // group (groups don't have one; propagating a style edit to every
  // child is a later polish item, not in M3) and not multi-selected.
  const styleable = selectedObject && selectedObject.type !== "group" ? selectedObject : null;

  const updateStyle = useCallback(
    (patch: Partial<ShapeStyle>) => {
      if (!styleable) return;
      replaceObject(styleable.id, { ...styleable, style: { ...styleable.style, ...patch } });
    },
    [styleable, replaceObject],
  );

  // No history entry here, matching updateStyle above — both are driven by
  // continuous input fields (text box keystrokes, a number input) with no
  // clean "gesture end" signal the way a drag has, so they're not part of
  // the undo stack (same as e.g. a color picker's live-preview drag).
  const updateText = useCallback(
    (patch: Partial<Pick<TextObject, "content" | "fontSize">>) => {
      if (!styleable || styleable.type !== "text") return;
      replaceObject(styleable.id, { ...styleable, ...patch });
    },
    [styleable, replaceObject],
  );

  // Holds the exact listener function references passed to addEventListener
  // at drag-start, so stopDrag can remove precisely those — without either
  // listener needing to reference its own name (a self-referential closure
  // inside useCallback, which react-hooks/immutability rightly flags: the
  // callback would be reading its own `const` binding from inside its own
  // body, which only happens to work because the body doesn't run until
  // called later, not because the reference is actually sound).
  const activeListenersRef = useRef<{ move: (e: globalThis.MouseEvent) => void; up: () => void } | null>(null);

  const stopDrag = useCallback(() => {
    const listeners = activeListenersRef.current;
    if (!listeners) return;
    window.removeEventListener("mousemove", listeners.move);
    window.removeEventListener("mouseup", listeners.up);
    activeListenersRef.current = null;
  }, []);

  const onPointerMove = useCallback(
    (e: globalThis.MouseEvent) => {
      const drag = dragRef.current;
      const current = docRef.current;
      if (!drag || !current) return;
      const docPoint = clientToDocPoint(e.clientX, e.clientY);

      if (drag.kind === "draw") {
        const { startDocPoint, tool: drawTool } = drag;
        if (drawTool === "line") {
          setDraft(createLine(startDocPoint.x, startDocPoint.y, docPoint.x, docPoint.y));
          return;
        }
        const x = Math.min(startDocPoint.x, docPoint.x);
        const y = Math.min(startDocPoint.y, docPoint.y);
        const width = Math.abs(docPoint.x - startDocPoint.x);
        const height = Math.abs(docPoint.y - startDocPoint.y);
        setDraft(
          drawTool === "rect"
            ? createRect(x, y, width, height)
            : createEllipse(x + width / 2, y + height / 2, width / 2, height / 2),
        );
        return;
      }

      if (drag.kind === "pan") {
        const dx = (e.clientX - drag.startClientPoint.x) / drag.scale;
        const dy = (e.clientY - drag.startClientPoint.y) / drag.scale;
        setPan({ x: drag.startPan.x - dx, y: drag.startPan.y - dy });
        return;
      }

      if (drag.kind === "marquee") {
        const x = Math.min(drag.startDocPoint.x, docPoint.x);
        const y = Math.min(drag.startDocPoint.y, docPoint.y);
        setMarqueeRect({
          x,
          y,
          width: Math.abs(docPoint.x - drag.startDocPoint.x),
          height: Math.abs(docPoint.y - drag.startDocPoint.y),
        });
        return;
      }

      if (drag.kind === "pen-anchor") {
        const anchors = penAnchorsRef.current;
        const last = anchors[anchors.length - 1];
        if (!last) return;
        if (Math.hypot(docPoint.x - last.x, docPoint.y - last.y) < PEN_HANDLE_MIN_DRAG) return;
        const outHandle = { x: docPoint.x, y: docPoint.y };
        const nextAnchor: PathAnchor = { x: last.x, y: last.y, outHandle, inHandle: mirroredHandle(last, outHandle) };
        setPenAnchors([...anchors.slice(0, -1), nextAnchor]);
        return;
      }

      const obj = current.objects.find((o) => o.id === drag.id);
      if (!obj || !isTransformable(obj)) return;

      if (drag.kind === "move") {
        const dx = docPoint.x - drag.startDocPoint.x;
        const dy = docPoint.y - drag.startDocPoint.y;
        replaceObject(obj.id, { ...obj, transform: moveBy(drag.startTransform, dx, dy) });
      } else if (drag.kind === "resize") {
        replaceObject(obj.id, { ...obj, transform: resizeTransform(obj, drag.handle, docPoint) });
      } else if (drag.kind === "rotate") {
        const currentAngle = pointerAngleDegrees(documentCenter(obj), docPoint);
        const rotation = rotationFromDrag(drag.startRotation, drag.startAngle, currentAngle);
        replaceObject(obj.id, { ...obj, transform: { ...obj.transform, rotation } });
      }
    },
    [clientToDocPoint, replaceObject],
  );

  const onPointerUp = useCallback(() => {
    stopDrag();
    const drag = dragRef.current;
    dragRef.current = null;
    const before = gestureBeforeRef.current;
    gestureBeforeRef.current = null;

    if (drag?.kind === "move" || drag?.kind === "resize" || drag?.kind === "rotate") {
      // Every intermediate position was already applied live via
      // replaceObject during onPointerMove (each call its own past mouse
      // event, so docRef.current is settled by the time this separate
      // mouseup event fires) — just record the one history entry for the
      // whole gesture.
      pushHistoryEntry(before, docRef.current);
      return;
    }
    if (drag?.kind === "pan") return; // viewport-only, nothing to commit/undo

    if (drag?.kind === "marquee") {
      const rect = marqueeRectRef.current;
      setMarqueeRect(null);
      const current = docRef.current;
      // A click-without-drag (no marqueeRect ever set, or a near-zero
      // drag) is treated as a plain click on empty canvas: clear the
      // selection, unless shift was held (more likely a near-miss than
      // intent to clear a multi-selection being built up).
      if (!current || !rect || rect.width < 2 || rect.height < 2) {
        if (!marqueeShiftRef.current) setSelectedIds(new Set());
        return;
      }
      const matched = current.objects.filter((o) => isTransformable(o) && boundsIntersect(documentBounds(o), rect));
      setSelectedIds((prev) => {
        const ids = matched.map((o) => o.id);
        return marqueeShiftRef.current ? new Set([...prev, ...ids]) : new Set(ids);
      });
      return;
    }
    if (drag?.kind !== "draw") return;

    setDraft(null);
    const current = docRef.current;
    const finalDraft = draftRef.current;
    if (!current || !finalDraft) return;
    // Ignore an accidental click-without-drag (zero-size shape). A line's
    // bounding box legitimately has a zero width or height when it's
    // perfectly horizontal/vertical, so it's checked by endpoint distance
    // instead of the (rect/ellipse-shaped) bounding-box check.
    if (finalDraft.type === "line") {
      if (Math.hypot(finalDraft.x2 - finalDraft.x1, finalDraft.y2 - finalDraft.y1) < 1) {
        setTool("select");
        return;
      }
    } else {
      const bounds = localBounds(finalDraft);
      if (bounds.width < 1 || bounds.height < 1) {
        setTool("select");
        return;
      }
    }
    const after = { ...current, objects: [...current.objects, finalDraft] };
    commitDoc(after);
    pushHistoryEntry(before, after);
    setSelectedIds(new Set([finalDraft.id]));
    setTool("select");
  }, [stopDrag, commitDoc, pushHistoryEntry]);

  const startDrag = useCallback(
    (mode: DragMode) => {
      dragRef.current = mode;
      // "pen-anchor", "marquee", and "pan" don't mutate `doc` at all (they
      // edit in-progress UI-only state instead) — nothing to snapshot for
      // undo/redo there; see commitPenPath for the pen tool's one history
      // entry.
      if (mode.kind !== "pen-anchor" && mode.kind !== "marquee" && mode.kind !== "pan") {
        gestureBeforeRef.current = docRef.current;
      }
      activeListenersRef.current = { move: onPointerMove, up: onPointerUp };
      window.addEventListener("mousemove", onPointerMove);
      window.addEventListener("mouseup", onPointerUp);
    },
    [onPointerMove, onPointerUp],
  );

  const commitPenPath = useCallback(
    (closed: boolean) => {
      const anchors = penAnchorsRef.current;
      setPenAnchors([]);
      setPenPreviewPoint(null);
      if (anchors.length < 2) return;
      const current = docRef.current;
      if (!current) return;
      const path = createPath(anchors, closed);
      const after = { ...current, objects: [...current.objects, path] };
      commitDoc(after);
      pushHistoryEntry(current, after);
      setSelectedIds(new Set([path.id]));
      setTool("select");
    },
    [commitDoc, pushHistoryEntry],
  );

  const cancelPenPath = useCallback(() => {
    setPenAnchors([]);
    setPenPreviewPoint(null);
  }, []);

  const groupSelection = useCallback(() => {
    const current = docRef.current;
    if (!current || selectedIds.size < 2) return;
    const toGroup = current.objects.filter((o) => selectedIds.has(o.id));
    if (toGroup.length < 2) return;
    const rest = current.objects.filter((o) => !selectedIds.has(o.id));
    const group = createGroup(toGroup);
    const after = { ...current, objects: [...rest, group] };
    commitDoc(after);
    pushHistoryEntry(current, after);
    setSelectedIds(new Set([group.id]));
  }, [selectedIds, commitDoc, pushHistoryEntry]);

  const ungroupSelection = useCallback(() => {
    const current = docRef.current;
    if (!current || selectedObject?.type !== "group") return;
    const group = selectedObject;
    // Bakes the group's own transform into each child so ungrouping
    // doesn't move anything on screen — only valid because a group's own
    // transform stays translation-only in M3 (see createGroup's doc
    // comment); a plain x/y addition wouldn't be correct once groups can
    // also be resized/rotated as a whole.
    const restored = group.children.map((child) => ({
      ...child,
      transform: { ...child.transform, x: child.transform.x + group.transform.x, y: child.transform.y + group.transform.y },
    }));
    const rest = current.objects.filter((o) => o.id !== group.id);
    const after = { ...current, objects: [...rest, ...restored] };
    commitDoc(after);
    pushHistoryEntry(current, after);
    setSelectedIds(new Set(restored.map((c) => c.id)));
  }, [selectedObject, commitDoc, pushHistoryEntry]);

  const undoAction = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const result = undoHistory(historyRef.current, current);
    if (!result) return;
    setHistory(result.history);
    setDoc(result.document);
    setDirty(lastLoadedRef.current !== serializeDocument(result.document));
    setSelectedIds(new Set());
  }, []);

  const redoAction = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const result = redoHistory(historyRef.current, current);
    if (!result) return;
    setHistory(result.history);
    setDoc(result.document);
    setDirty(lastLoadedRef.current !== serializeDocument(result.document));
    setSelectedIds(new Set());
  }, []);

  const deleteSelection = useCallback(() => {
    const current = docRef.current;
    if (!current || selectedIds.size === 0) return;
    const after = { ...current, objects: current.objects.filter((o) => !selectedIds.has(o.id)) };
    commitDoc(after);
    pushHistoryEntry(current, after);
    setSelectedIds(new Set());
  }, [selectedIds, commitDoc, pushHistoryEntry]);

  const duplicateSelection = useCallback(() => {
    const current = docRef.current;
    if (!current || selectedObjects.length === 0) return;
    const clones = selectedObjects.map((o) => {
      const clone = cloneWithNewIds(o);
      return { ...clone, transform: { ...clone.transform, x: clone.transform.x + DUPLICATE_OFFSET, y: clone.transform.y + DUPLICATE_OFFSET } };
    });
    const after = { ...current, objects: [...current.objects, ...clones] };
    commitDoc(after);
    pushHistoryEntry(current, after);
    setSelectedIds(new Set(clones.map((c) => c.id)));
  }, [selectedObjects, commitDoc, pushHistoryEntry]);

  // In-memory only — not the system clipboard. A vector shape isn't text,
  // and Electron's clipboard API doesn't have a good place to put
  // arbitrary app-defined JSON without polluting the OS clipboard with a
  // custom format other apps can't read either; paste-within-this-pane is
  // the only use case this needs to support.
  const clipboardRef = useRef<SceneObject[]>([]);

  const copySelection = useCallback(() => {
    if (selectedObjects.length === 0) return;
    clipboardRef.current = selectedObjects.map((o) => o);
  }, [selectedObjects]);

  const pasteClipboard = useCallback(() => {
    const current = docRef.current;
    if (!current || clipboardRef.current.length === 0) return;
    const clones = clipboardRef.current.map((o) => {
      const clone = cloneWithNewIds(o);
      return { ...clone, transform: { ...clone.transform, x: clone.transform.x + DUPLICATE_OFFSET, y: clone.transform.y + DUPLICATE_OFFSET } };
    });
    const after = { ...current, objects: [...current.objects, ...clones] };
    commitDoc(after);
    pushHistoryEntry(current, after);
    setSelectedIds(new Set(clones.map((c) => c.id)));
  }, [commitDoc, pushHistoryEntry]);

  const nudgeSelection = useCallback(
    (dx: number, dy: number) => {
      const current = docRef.current;
      if (!current || selectedTransformableObjects.length === 0) return;
      const ids = new Set(selectedTransformableObjects.map((o) => o.id));
      const after = {
        ...current,
        objects: current.objects.map((o) =>
          ids.has(o.id) && isTransformable(o) ? { ...o, transform: moveBy(o.transform, dx, dy) } : o,
        ),
      };
      commitDoc(after);
      pushHistoryEntry(current, after);
    },
    [selectedTransformableObjects, commitDoc, pushHistoryEntry],
  );

  // Z-order — doc.objects's array order *is* draw order (see sceneGraph.ts
  // and renderShape below), so this is plain array reordering, not a new
  // concept. Scoped to the top-level array only: a group's children are
  // never independently selectable (clicking any child selects the whole
  // group — see renderShape's clickTarget), so selectedIds can only ever
  // contain top-level object ids.
  const reorderSelection = useCallback(
    (direction: "front" | "back" | "forward" | "backward") => {
      const current = docRef.current;
      if (!current || selectedIds.size === 0) return;
      const objects = current.objects;
      const isSel = (o: SceneObject) => selectedIds.has(o.id);
      let next: SceneObject[];
      if (direction === "front") {
        next = [...objects.filter((o) => !isSel(o)), ...objects.filter(isSel)];
      } else if (direction === "back") {
        next = [...objects.filter(isSel), ...objects.filter((o) => !isSel(o))];
      } else {
        next = [...objects];
        const indices = next.reduce<number[]>((acc, o, i) => (isSel(o) ? [...acc, i] : acc), []);
        // Step each selected object past one neighbor. Processed from the
        // trailing end for "forward" (so an already-moved item doesn't
        // immediately collide with the next selected one behind it) and
        // from the leading end for "backward" (mirror image).
        if (direction === "forward") {
          for (let k = indices.length - 1; k >= 0; k--) {
            const i = indices[k];
            if (i < next.length - 1 && !isSel(next[i + 1])) [next[i], next[i + 1]] = [next[i + 1], next[i]];
          }
        } else {
          for (let k = 0; k < indices.length; k++) {
            const i = indices[k];
            if (i > 0 && !isSel(next[i - 1])) [next[i], next[i - 1]] = [next[i - 1], next[i]];
          }
        }
      }
      const after = { ...current, objects: next };
      commitDoc(after);
      pushHistoryEntry(current, after);
    },
    [selectedIds, commitDoc, pushHistoryEntry],
  );

  // Each object flips about its *own* local center (the same pivot
  // svgTransform/resizeTransform already use) rather than the selection's
  // combined center — flipping a multi-selection as one rigid group would
  // also need to mirror each object's position relative to the others,
  // which is real additional math; scoped out for now (see
  // docs/architecture/10-creative-panes-ux-roadmap.md).
  const flipSelection = useCallback(
    (axis: "x" | "y") => {
      const current = docRef.current;
      if (!current || selectedTransformableObjects.length === 0) return;
      const ids = new Set(selectedTransformableObjects.map((o) => o.id));
      const after = {
        ...current,
        objects: current.objects.map((o) => {
          if (!ids.has(o.id) || !isTransformable(o)) return o;
          const t = o.transform;
          return { ...o, transform: axis === "x" ? { ...t, scaleX: t.scaleX * -1 } : { ...t, scaleY: t.scaleY * -1 } };
        }),
      };
      commitDoc(after);
      pushHistoryEntry(current, after);
    },
    [selectedTransformableObjects, commitDoc, pushHistoryEntry],
  );

  // "Fit" and "reset zoom" are the same action here: with the viewBox
  // always set to `pan.x pan.y doc.width/zoom doc.height/zoom` and the
  // svg element's default preserveAspectRatio="xMidYMid meet", zoom=1
  // (viewBox = the whole document) already letterboxes to fit whatever
  // the container's actual pixel size is — there's no separate "compute
  // container size and scale to match" step needed the way a canvas-based
  // renderer would require.
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
      const doc0 = docRef.current;
      if (doc0) {
        setPan((p) => {
          const centerX = p.x + doc0.width / z / 2;
          const centerY = p.y + doc0.height / z / 2;
          return { x: centerX - doc0.width / nextZoom / 2, y: centerY - doc0.height / nextZoom / 2 };
        });
      }
      return nextZoom;
    });
  }, []);

  // Fits the current selection's bounding box in view (centered), keeping
  // the document's own aspect ratio for the viewBox — see resetView's
  // comment for why zoom is a single scalar rather than independent x/y
  // scale factors. A selection with a different aspect ratio than the
  // whole document ends up fully visible but not edge-to-edge on every
  // side, same tradeoff every "fit" implementation with a fixed-aspect
  // viewport makes.
  const zoomToSelection = useCallback(() => {
    const current = docRef.current;
    if (!current || selectedTransformableObjects.length === 0) return;
    const bounds = boundsUnion(selectedTransformableObjects.map(documentBounds));
    const pad = Math.max(bounds.width, bounds.height, 1) * 0.2;
    const nextZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(current.width / (bounds.width + pad * 2), current.height / (bounds.height + pad * 2))),
    );
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    setZoom(nextZoom);
    setPan({ x: center.x - current.width / nextZoom / 2, y: center.y - current.height / nextZoom / 2 });
  }, [selectedTransformableObjects]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (tool === "pen") {
        if (e.key === "Enter") {
          e.preventDefault();
          commitPenPath(false);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancelPenPath();
          return;
        }
      }
      const target = e.target as HTMLElement | null;
      const inTextInput = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.metaKey || e.ctrlKey) {
        if (inTextInput) return; // let native undo/copy/paste work in the inspector's own inputs
        const key = e.key.toLowerCase();
        if (key === "g") {
          e.preventDefault();
          if (e.shiftKey) ungroupSelection();
          else groupSelection();
        } else if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) redoAction();
          else undoAction();
        } else if (key === "d") {
          e.preventDefault();
          duplicateSelection();
        } else if (key === "c") {
          e.preventDefault();
          copySelection();
        } else if (key === "v") {
          e.preventDefault();
          pasteClipboard();
        }
        return;
      }
      if (e.altKey || inTextInput) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelection();
        return;
      }
      // Z-order — "]"/"[" step one at a time; their shifted forms on a US
      // keyboard ("}"/"{") jump straight to front/back, so this reads
      // e.key's produced character rather than checking e.shiftKey
      // (shift+[ never actually sends key "[").
      if (e.key === "]") {
        e.preventDefault();
        reorderSelection("forward");
        return;
      }
      if (e.key === "[") {
        e.preventDefault();
        reorderSelection("backward");
        return;
      }
      if (e.key === "}") {
        e.preventDefault();
        reorderSelection("front");
        return;
      }
      if (e.key === "{") {
        e.preventDefault();
        reorderSelection("back");
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        flipSelection("x");
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        flipSelection("y");
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        zoomBy(1 / ZOOM_STEP);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        resetView();
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        zoomToSelection();
        return;
      }
      const nudgeStep = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeSelection(-nudgeStep, 0);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeSelection(nudgeStep, 0);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeSelection(0, -nudgeStep);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeSelection(0, nudgeStep);
        return;
      }
      const nextTool = TOOL_SHORTCUTS[e.key.toLowerCase()];
      if (nextTool) setTool(nextTool);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tool,
    commitPenPath,
    cancelPenPath,
    groupSelection,
    ungroupSelection,
    undoAction,
    redoAction,
    deleteSelection,
    duplicateSelection,
    copySelection,
    pasteClipboard,
    nudgeSelection,
    reorderSelection,
    flipSelection,
    zoomBy,
    resetView,
    zoomToSelection,
  ]);

  const onCanvasMouseDown = (e: ReactMouseEvent<SVGSVGElement>) => {
    const docPoint = clientToDocPoint(e.clientX, e.clientY);
    if (spaceHeld || e.button === 1) {
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      startDrag({ kind: "pan", startClientPoint: { x: e.clientX, y: e.clientY }, startPan: pan, scale: ctm?.a || 1 });
      return;
    }
    if (tool === "rect" || tool === "ellipse" || tool === "line") {
      startDrag({ kind: "draw", tool, startDocPoint: docPoint });
      return;
    }
    if (tool === "text") {
      const current = docRef.current;
      if (!current) return;
      const text = createText(docPoint.x, docPoint.y);
      const after = { ...current, objects: [...current.objects, text] };
      commitDoc(after);
      pushHistoryEntry(current, after);
      setSelectedIds(new Set([text.id]));
      setTool("select");
      return;
    }
    if (tool === "pen") {
      const anchors = penAnchorsRef.current;
      const first = anchors[0];
      if (first && anchors.length > 2 && Math.hypot(docPoint.x - first.x, docPoint.y - first.y) < PEN_CLOSE_THRESHOLD) {
        commitPenPath(true);
        return;
      }
      setPenAnchors([...anchors, { x: docPoint.x, y: docPoint.y }]);
      startDrag({ kind: "pen-anchor" });
      return;
    }
    // Clicked/dragged on empty canvas (not a shape/handle, those
    // stopPropagation their own mousedown below) — start a marquee drag.
    // onPointerUp decides what actually happens: a real drag selects
    // everything the rectangle intersects, a plain click-without-drag
    // clears the selection instead (unless shift-clicking, more likely a
    // near-miss than intent to clear a multi-selection being built up —
    // same reasoning the old immediate-deselect-on-click had).
    if (tool === "select") {
      marqueeShiftRef.current = e.shiftKey;
      startDrag({ kind: "marquee", startDocPoint: docPoint });
    }
  };

  const onCanvasMouseMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (tool !== "pen" || penAnchorsRef.current.length === 0) return;
    // Rubber-band preview to where the *next* anchor would land — only
    // while not actively pulling a handle (that's onPointerMove's job,
    // driven by the window-level drag instead of this plain hover
    // handler, so the two don't fight over the same frame).
    if (dragRef.current?.kind === "pen-anchor") return;
    setPenPreviewPoint(clientToDocPoint(e.clientX, e.clientY));
  };

  // Plain wheel = pan (matches every mainstream editor's trackpad-scroll
  // convention); ctrl/cmd+wheel = zoom (trackpad pinch is delivered as
  // ctrlKey+wheel by the browser, and it's also the standard "hold to
  // zoom instead of scroll" modifier for a mouse wheel).
  const onCanvasWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const docPoint = clientToDocPoint(e.clientX, e.clientY);
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-e.deltaY * ZOOM_WHEEL_SENSITIVITY)));
      // Keep the point under the cursor fixed in document space — derived
      // from "the cursor's fraction across the old viewBox stays the same
      // fraction across the new one" (see zoomBy's simpler center-anchored
      // version for the non-pointer-driven case).
      setPan({
        x: docPoint.x - (docPoint.x - pan.x) * (zoom / nextZoom),
        y: docPoint.y - (docPoint.y - pan.y) * (zoom / nextZoom),
      });
      setZoom(nextZoom);
      return;
    }
    setPan((p) => ({ x: p.x + e.deltaX / zoom, y: p.y + e.deltaY / zoom }));
  };

  const onShapeMouseDown = (e: ReactMouseEvent, obj: TransformableObject) => {
    // Space-held pan wins over shape interaction even when the mousedown
    // lands on a shape — this handler stopPropagation()s below, which
    // would otherwise stop onCanvasMouseDown's own pan-start check from
    // ever seeing the event.
    if (spaceHeld) {
      e.stopPropagation();
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      startDrag({ kind: "pan", startClientPoint: { x: e.clientX, y: e.clientY }, startPan: pan, scale: ctm?.a || 1 });
      return;
    }
    if (tool !== "select") return;
    e.stopPropagation();
    if (e.shiftKey) {
      // Toggle-only — building a multi-selection for Group doesn't also
      // start a move-drag (there's no defined "move N unrelated shapes
      // together" story until they're actually grouped into one object).
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(obj.id)) next.delete(obj.id);
        else next.add(obj.id);
        return next;
      });
      return;
    }
    setSelectedIds(new Set([obj.id]));
    const docPoint = clientToDocPoint(e.clientX, e.clientY);
    startDrag({ kind: "move", id: obj.id, startDocPoint: docPoint, startTransform: obj.transform });
  };

  const onHandleMouseDown = (e: ReactMouseEvent, id: string, handle: HandleId) => {
    e.stopPropagation();
    startDrag({ kind: "resize", id, handle });
  };

  const onRotateHandleMouseDown = (e: ReactMouseEvent, obj: TransformableObject) => {
    e.stopPropagation();
    const docPoint = clientToDocPoint(e.clientX, e.clientY);
    const startAngle = pointerAngleDegrees(documentCenter(obj), docPoint);
    startDrag({ kind: "rotate", id: obj.id, startAngle, startRotation: obj.transform.rotation });
  };

  // clickTarget: what a mousedown on this shape actually selects/drags —
  // itself by default, but when recursing into a group's children (see
  // the "group" case below) it's the *group*, so clicking any child of a
  // group selects the whole group first (matches every mainstream
  // editor's single-click behavior; double-click to drill into a group
  // and select an individual child is a later polish item, not in M3).
  const renderShape = (obj: SceneObject, clickTarget?: TransformableObject) => {
    if (obj.type === "rect") {
      const target = clickTarget ?? obj;
      return (
        <rect
          key={obj.id}
          x={obj.x}
          y={obj.y}
          width={obj.width}
          height={obj.height}
          rx={obj.rx}
          fill={obj.style.fill ?? "none"}
          stroke={obj.style.stroke ?? "none"}
          strokeWidth={obj.style.strokeWidth}
          opacity={obj.style.opacity}
          transform={svgTransform(obj)}
          onMouseDown={(e) => onShapeMouseDown(e, target)}
        />
      );
    }
    if (obj.type === "ellipse") {
      const target = clickTarget ?? obj;
      return (
        <ellipse
          key={obj.id}
          cx={obj.cx}
          cy={obj.cy}
          rx={obj.rx}
          ry={obj.ry}
          fill={obj.style.fill ?? "none"}
          stroke={obj.style.stroke ?? "none"}
          strokeWidth={obj.style.strokeWidth}
          opacity={obj.style.opacity}
          transform={svgTransform(obj)}
          onMouseDown={(e) => onShapeMouseDown(e, target)}
        />
      );
    }
    if (obj.type === "line") {
      const target = clickTarget ?? obj;
      return (
        <line
          key={obj.id}
          x1={obj.x1}
          y1={obj.y1}
          x2={obj.x2}
          y2={obj.y2}
          stroke={obj.style.stroke ?? "none"}
          strokeWidth={obj.style.strokeWidth}
          opacity={obj.style.opacity}
          transform={svgTransform(obj)}
          onMouseDown={(e) => onShapeMouseDown(e, target)}
        />
      );
    }
    if (obj.type === "path") {
      const target = clickTarget ?? obj;
      return (
        <path
          key={obj.id}
          d={anchorsToPathData(obj.anchors, obj.closed)}
          fill={obj.style.fill ?? "none"}
          stroke={obj.style.stroke ?? "none"}
          strokeWidth={obj.style.strokeWidth}
          opacity={obj.style.opacity}
          transform={svgTransform(obj)}
          onMouseDown={(e) => onShapeMouseDown(e, target)}
        />
      );
    }
    if (obj.type === "group") {
      return (
        <g key={obj.id} transform={svgTransform(obj)}>
          {obj.children.map((child) => renderShape(child, obj))}
        </g>
      );
    }
    if (obj.type === "text") {
      const target = clickTarget ?? obj;
      return (
        <text
          key={obj.id}
          x={obj.x}
          y={obj.y}
          fontSize={obj.fontSize}
          fontFamily={obj.fontFamily}
          fill={obj.style.fill ?? "#000000"}
          opacity={obj.style.opacity}
          transform={svgTransform(obj)}
          style={{ userSelect: "none" }}
          onMouseDown={(e) => onShapeMouseDown(e, target)}
        >
          {obj.content}
        </text>
      );
    }
    return null;
  };

  if (error) {
    return <div className="vector-empty">{error}</div>;
  }
  if (!doc) {
    return <div className="vector-empty">Loading…</div>;
  }

  // Full rotated-outline + resize/rotate handles — single non-group
  // selection only.
  const corners = selectedResizable ? documentCorners(selectedResizable) : null;
  const rotateHandlePoint = selectedResizable
    ? (() => {
        const bounds = localBounds(selectedResizable);
        const nLocal = handleLocalPoint(bounds, "n");
        const nDoc = toDocumentPoint(nLocal, selectedResizable);
        // Offset "up" along the shape's own rotated axis, not the
        // document's — so the handle stays visually above the shape at
        // any rotation.
        const centerLocal = { x: bounds.x + bounds.width / 2, y: bounds.y - ROTATE_HANDLE_OFFSET };
        return toDocumentPoint(centerLocal, selectedResizable) ?? nDoc;
      })()
    : null;
  // A plain axis-aligned outline — a single group or text object (no
  // resize/rotate handles, see selectedResizable) or a 2+ multi-selection
  // (grouped via ⌘G to get real transform support).
  const nonResizableOutlineBounds =
    selectedTransformable && (selectedTransformable.type === "group" || selectedTransformable.type === "text")
      ? documentBounds(selectedTransformable)
      : null;
  const multiSelectBounds =
    selectedIds.size > 1 && selectedTransformableObjects.length > 0
      ? boundsUnion(selectedTransformableObjects.map(documentBounds))
      : null;
  const plainOutlineBounds = nonResizableOutlineBounds ?? multiSelectBounds;

  return (
    <div className="vector-editor">
      <div className="vector-toolbar">
        <Tooltip title="Select" description="V — click to select, drag to move, shift-click to multi-select">
          <button
            type="button"
            className={`vector-tool${tool === "select" ? " active" : ""}`}
            onClick={() => setTool("select")}
          >
            <SelectIcon />
          </button>
        </Tooltip>
        <Tooltip title="Rectangle" description="R — click-drag to draw a rectangle">
          <button
            type="button"
            className={`vector-tool${tool === "rect" ? " active" : ""}`}
            onClick={() => setTool("rect")}
          >
            <RectIcon />
          </button>
        </Tooltip>
        <Tooltip title="Ellipse" description="O — click-drag to draw an ellipse">
          <button
            type="button"
            className={`vector-tool${tool === "ellipse" ? " active" : ""}`}
            onClick={() => setTool("ellipse")}
          >
            <EllipseIcon />
          </button>
        </Tooltip>
        <Tooltip title="Line" description="L — click-drag to draw a straight line">
          <button
            type="button"
            className={`vector-tool${tool === "line" ? " active" : ""}`}
            onClick={() => setTool("line")}
          >
            <LineIcon />
          </button>
        </Tooltip>
        <Tooltip
          title="Pen"
          description="P — click to add anchors, drag while placing for a smooth curve, Enter or click the first anchor to finish"
        >
          <button
            type="button"
            className={`vector-tool${tool === "pen" ? " active" : ""}`}
            onClick={() => setTool("pen")}
          >
            <PenIcon />
          </button>
        </Tooltip>
        <Tooltip title="Text" description="T — click to place, edit content and size in the panel on the right">
          <button
            type="button"
            className={`vector-tool${tool === "text" ? " active" : ""}`}
            onClick={() => setTool("text")}
          >
            <TextIcon />
          </button>
        </Tooltip>
        <Tooltip title="Group" description="⌘G — combine the current multi-selection into one object">
          <button type="button" className="vector-tool" disabled={selectedIds.size < 2} onClick={groupSelection}>
            <GroupIcon />
          </button>
        </Tooltip>
        <Tooltip title="Ungroup" description="⌘⇧G — split the selected group back into its individual objects">
          <button
            type="button"
            className="vector-tool"
            disabled={selectedObject?.type !== "group"}
            onClick={ungroupSelection}
          >
            <UngroupIcon />
          </button>
        </Tooltip>
        <Tooltip title="Undo" description="⌘Z — undo the last completed action">
          <button type="button" className="vector-tool" disabled={!canUndo(history)} onClick={undoAction}>
            <UndoIcon />
          </button>
        </Tooltip>
        <Tooltip title="Redo" description="⌘⇧Z — redo the last undone action">
          <button type="button" className="vector-tool" disabled={!canRedo(history)} onClick={redoAction}>
            <RedoIcon />
          </button>
        </Tooltip>
        <Tooltip title="Send to Back" description="{ — move the selection behind everything else">
          <button
            type="button"
            className="vector-tool"
            disabled={selectedIds.size === 0}
            onClick={() => reorderSelection("back")}
          >
            <SendToBackIcon />
          </button>
        </Tooltip>
        <Tooltip title="Send Backward" description="[ — move the selection one step behind its neighbor">
          <button
            type="button"
            className="vector-tool"
            disabled={selectedIds.size === 0}
            onClick={() => reorderSelection("backward")}
          >
            <SendBackwardIcon />
          </button>
        </Tooltip>
        <Tooltip title="Bring Forward" description="] — move the selection one step in front of its neighbor">
          <button
            type="button"
            className="vector-tool"
            disabled={selectedIds.size === 0}
            onClick={() => reorderSelection("forward")}
          >
            <BringForwardIcon />
          </button>
        </Tooltip>
        <Tooltip title="Bring to Front" description="} — move the selection in front of everything else">
          <button
            type="button"
            className="vector-tool"
            disabled={selectedIds.size === 0}
            onClick={() => reorderSelection("front")}
          >
            <BringToFrontIcon />
          </button>
        </Tooltip>
        <Tooltip title="Flip Horizontal" description="⇧H — mirror the selection left-right about its own center">
          <button
            type="button"
            className="vector-tool"
            disabled={selectedTransformableObjects.length === 0}
            onClick={() => flipSelection("x")}
          >
            <FlipHorizontalIcon />
          </button>
        </Tooltip>
        <Tooltip title="Flip Vertical" description="⇧V — mirror the selection top-bottom about its own center">
          <button
            type="button"
            className="vector-tool"
            disabled={selectedTransformableObjects.length === 0}
            onClick={() => flipSelection("y")}
          >
            <FlipVerticalIcon />
          </button>
        </Tooltip>
        <span className="vector-toolbar-spacer" />
        <Tooltip title="Zoom Out" description="- — zoom out, centered on the current view">
          <button type="button" className="vector-tool" onClick={() => zoomBy(1 / ZOOM_STEP)}>
            <ZoomOutIcon />
          </button>
        </Tooltip>
        <Tooltip title="Reset Zoom" description="0 — back to 100%, viewport centered on the document">
          <button type="button" className="vector-tool vector-zoom-label" onClick={resetView}>
            {Math.round(zoom * 100)}%
          </button>
        </Tooltip>
        <Tooltip title="Zoom In" description="+ — zoom in, centered on the current view">
          <button type="button" className="vector-tool" onClick={() => zoomBy(ZOOM_STEP)}>
            <ZoomInIcon />
          </button>
        </Tooltip>
        <Tooltip title="Zoom to Selection" description="2 — fit the current selection in view">
          <button
            type="button"
            className="vector-tool"
            disabled={selectedTransformableObjects.length === 0}
            onClick={zoomToSelection}
          >
            <ZoomToSelectionIcon />
          </button>
        </Tooltip>
        <span className="vector-toolbar-spacer" />
        <Tooltip title="Export SVG" description="Write the document as a real .svg file next to the project">
          <button type="button" className="vector-tool vector-tool-label" onClick={() => void exportSvg()}>
            <DownloadIcon />
            SVG
          </button>
        </Tooltip>
        <Tooltip title="Export PNG" description="Rasterize the document and download it as a .png file">
          <button type="button" className="vector-tool vector-tool-label" onClick={() => void exportPng()}>
            <DownloadIcon />
            PNG
          </button>
        </Tooltip>
        <span className={`vector-save-status${dirty ? " unsaved" : ""}`}>{dirty ? "Unsaved" : "Saved"}</span>
        <Tooltip title="Save" description="⌘S — write the current document to its .vec.json project file">
          <button type="button" className="vector-save" onClick={() => void save()}>
            <SaveIcon />
            Save
          </button>
        </Tooltip>
        <Tooltip title="File Explorer" description="Toggle the file tree sidebar for this pane">
          <button
            type="button"
            className={`obsidian-topbar-icon${treeOpen ? " active" : ""}`}
            onClick={onToggleTree}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M1.5 2.5A1.5 1.5 0 0 1 3 1h4.586a1 1 0 0 1 .707.293l1.414 1.414A1 1 0 0 0 10.414 3.5H13A1.5 1.5 0 0 1 14.5 5v8.5A1.5 1.5 0 0 1 13 15H3A1.5 1.5 0 0 1 1.5 13.5v-11Z"
              />
            </svg>
          </button>
        </Tooltip>
      </div>
      <div className="vector-body">
      <div className="vector-canvas-scroll">
        <svg
          ref={svgRef}
          className={`vector-canvas${tool !== "select" ? " vector-canvas-drawing" : ""}${spaceHeld ? " vector-canvas-pan" : ""}`}
          viewBox={`${pan.x} ${pan.y} ${doc.width / zoom} ${doc.height / zoom}`}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onWheel={onCanvasWheel}
        >
          <rect x={0} y={0} width={doc.width} height={doc.height} fill={doc.background} />
          {doc.objects.map((obj) => renderShape(obj))}
          {draft && renderShape(draft)}
          {marqueeRect && (
            <rect
              className="vector-marquee"
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.width}
              height={marqueeRect.height}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {penAnchors.length > 0 && (
            <g className="vector-pen-preview">
              <path
                d={anchorsToPathData(
                  penPreviewPoint ? [...penAnchors, { x: penPreviewPoint.x, y: penPreviewPoint.y }] : penAnchors,
                  false,
                )}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1}
                strokeDasharray={penPreviewPoint ? "4 3" : undefined}
              />
              {penAnchors.map((a, i) => (
                <circle key={i} cx={a.x} cy={a.y} r={3} className="vector-pen-anchor" />
              ))}
            </g>
          )}
          {selectedResizable && corners && (
            <g className="vector-selection">
              <polygon
                points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {rotateHandlePoint && (
                <>
                  <line
                    x1={corners[1].x + (corners[0].x - corners[1].x) / 2}
                    y1={corners[1].y + (corners[0].y - corners[1].y) / 2}
                    x2={rotateHandlePoint.x}
                    y2={rotateHandlePoint.y}
                    stroke="var(--accent)"
                    strokeWidth={1}
                  />
                  <circle
                    cx={rotateHandlePoint.x}
                    cy={rotateHandlePoint.y}
                    r={5}
                    className="vector-rotate-handle"
                    onMouseDown={(e) => onRotateHandleMouseDown(e, selectedResizable)}
                  />
                </>
              )}
              {RESIZE_HANDLES.map((handle) => {
                const bounds = localBounds(selectedResizable);
                const point = toDocumentPoint(handleLocalPoint(bounds, handle), selectedResizable);
                return (
                  <rect
                    key={handle}
                    x={point.x - 4}
                    y={point.y - 4}
                    width={8}
                    height={8}
                    className={`vector-resize-handle vector-resize-handle-${handle}`}
                    onMouseDown={(e) => onHandleMouseDown(e, selectedResizable.id, handle)}
                  />
                );
              })}
            </g>
          )}
          {plainOutlineBounds && !selectedResizable && (
            // A selected group (move-only, no resize/rotate yet — see
            // createGroup) or a 2+ multi-selection (⌘G to actually group
            // it) — just an outline, no handles. Dragging a group still
            // works by clicking any of its visible children (they route
            // clicks to the group — see renderShape's clickTarget), not
            // this outline itself.
            <rect
              className="vector-selection-outline"
              x={plainOutlineBounds.x}
              y={plainOutlineBounds.y}
              width={plainOutlineBounds.width}
              height={plainOutlineBounds.height}
            />
          )}
        </svg>
      </div>
      {styleable && (
        <div className="vector-inspector">
          {styleable.type === "text" && (
            <>
              <div className="vector-inspector-row">
                <label>Text</label>
                <input
                  type="text"
                  value={styleable.content}
                  onChange={(e) => updateText({ content: e.target.value })}
                />
              </div>
              <div className="vector-inspector-row">
                <label>Size</label>
                <input
                  type="number"
                  min={1}
                  value={styleable.fontSize}
                  onChange={(e) => updateText({ fontSize: Number(e.target.value) || 1 })}
                />
              </div>
            </>
          )}
          <div className="vector-inspector-row">
            <label>Fill</label>
            <input
              type="checkbox"
              checked={styleable.style.fill !== null}
              onChange={(e) => updateStyle({ fill: e.target.checked ? (styleable.style.fill ?? "#4c9aff") : null })}
            />
            <input
              type="color"
              value={styleable.style.fill ?? "#4c9aff"}
              disabled={styleable.style.fill === null}
              onChange={(e) => updateStyle({ fill: e.target.value })}
            />
          </div>
          <div className="vector-inspector-row">
            <label>Stroke</label>
            <input
              type="checkbox"
              checked={styleable.style.stroke !== null}
              onChange={(e) => updateStyle({ stroke: e.target.checked ? (styleable.style.stroke ?? "#1b1b1f") : null })}
            />
            <input
              type="color"
              value={styleable.style.stroke ?? "#1b1b1f"}
              disabled={styleable.style.stroke === null}
              onChange={(e) => updateStyle({ stroke: e.target.value })}
            />
          </div>
          <div className="vector-inspector-row">
            <label>Width</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={styleable.style.strokeWidth}
              onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="vector-inspector-row">
            <label>Opacity</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={styleable.style.opacity}
              onChange={(e) => updateStyle({ opacity: Number(e.target.value) })}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
