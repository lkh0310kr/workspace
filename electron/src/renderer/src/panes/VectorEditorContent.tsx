import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { listDir, readFile, writeFile } from "../electron";
import {
  createBlankDocument,
  createEllipse,
  createRect,
  parseDocument,
  serializeDocument,
  type EllipseObject,
  type RectObject,
  type SceneObject,
  type VectorDocument,
} from "./vector/sceneGraph";
import {
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
  type HandleId,
  type Point,
  type TransformableObject,
} from "./vector/vectorTransform";

// Vector Editor pane — M1 scope (see docs/architecture/08-vector-editor.md):
// Rect/Ellipse creation, single-selection, move/resize/rotate, save/load
// as plain JSON. No pen tool (M2), no stroke/fill UI or groups (M3), no
// undo/redo (M4), no text (M5) yet — see the design doc for the full
// build order.
interface Props {
  tabId: number;
  filePath: string | null;
  onAssignPath: (path: string) => void;
  treeOpen: boolean;
  onToggleTree: () => void;
}

type Tool = "select" | "rect" | "ellipse";

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
  | { kind: "draw"; tool: "rect" | "ellipse"; startDocPoint: Point };

const RESIZE_HANDLES: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const ROTATE_HANDLE_OFFSET = 24; // doc-space px above the "n" handle

async function findAvailableUntitledVectorName(tabId: number): Promise<string> {
  const entries = await listDir(tabId, "").catch(() => []);
  const names = new Set(entries.filter((e) => !e.is_dir).map((e) => e.name.toLowerCase()));
  if (!names.has("untitled.vec.json")) return "untitled.vec.json";
  let i = 1;
  while (names.has(`untitled ${i}.vec.json`)) i++;
  return `untitled ${i}.vec.json`;
}

function isTransformable(obj: SceneObject): obj is RectObject | EllipseObject {
  return obj.type === "rect" || obj.type === "ellipse";
}

export function VectorEditorContent({ tabId, filePath, onAssignPath, treeOpen, onToggleTree }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [doc, setDoc] = useState<VectorDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<RectObject | EllipseObject | null>(null);

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
  const draftRef = useRef<RectObject | EllipseObject | null>(draft);
  draftRef.current = draft;

  useEffect(() => {
    setError(null);
    setSelectedId(null);
    setDirty(false);
    setDraft(null);
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

  const selectedObject = doc?.objects.find((o) => o.id === selectedId) ?? null;
  const selectedTransformable =
    selectedObject && isTransformable(selectedObject) ? selectedObject : null;

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
    if (drag?.kind !== "draw") return;
    setDraft(null);
    const current = docRef.current;
    const finalDraft = draftRef.current;
    if (!current || !finalDraft) return;
    // Ignore an accidental click-without-drag (zero-size shape).
    const bounds = localBounds(finalDraft);
    if (bounds.width < 1 || bounds.height < 1) {
      setTool("select");
      return;
    }
    commitDoc({ ...current, objects: [...current.objects, finalDraft] });
    setSelectedId(finalDraft.id);
    setTool("select");
  }, [stopDrag, commitDoc]);

  const startDrag = useCallback(
    (mode: DragMode) => {
      dragRef.current = mode;
      activeListenersRef.current = { move: onPointerMove, up: onPointerUp };
      window.addEventListener("mousemove", onPointerMove);
      window.addEventListener("mouseup", onPointerUp);
    },
    [onPointerMove, onPointerUp],
  );

  const onCanvasMouseDown = (e: ReactMouseEvent<SVGSVGElement>) => {
    const docPoint = clientToDocPoint(e.clientX, e.clientY);
    if (tool === "rect" || tool === "ellipse") {
      startDrag({ kind: "draw", tool, startDocPoint: docPoint });
      return;
    }
    // Clicked empty canvas (not a shape/handle, those stopPropagation
    // their own mousedown below) — deselect.
    setSelectedId(null);
  };

  const onShapeMouseDown = (e: ReactMouseEvent, obj: RectObject | EllipseObject) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelectedId(obj.id);
    const docPoint = clientToDocPoint(e.clientX, e.clientY);
    startDrag({ kind: "move", id: obj.id, startDocPoint: docPoint, startTransform: obj.transform });
  };

  const onHandleMouseDown = (e: ReactMouseEvent, id: string, handle: HandleId) => {
    e.stopPropagation();
    startDrag({ kind: "resize", id, handle });
  };

  const onRotateHandleMouseDown = (e: ReactMouseEvent, obj: RectObject | EllipseObject) => {
    e.stopPropagation();
    const docPoint = clientToDocPoint(e.clientX, e.clientY);
    const startAngle = pointerAngleDegrees(documentCenter(obj), docPoint);
    startDrag({ kind: "rotate", id: obj.id, startAngle, startRotation: obj.transform.rotation });
  };

  const renderShape = (obj: SceneObject) => {
    if (obj.type === "rect") {
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
          onMouseDown={(e) => onShapeMouseDown(e, obj)}
        />
      );
    }
    if (obj.type === "ellipse") {
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
          onMouseDown={(e) => onShapeMouseDown(e, obj)}
        />
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

  const corners = selectedTransformable ? documentCorners(selectedTransformable) : null;
  const rotateHandlePoint = selectedTransformable
    ? (() => {
        const bounds = localBounds(selectedTransformable);
        const nLocal = handleLocalPoint(bounds, "n");
        const nDoc = toDocumentPoint(nLocal, selectedTransformable);
        // Offset "up" along the shape's own rotated axis, not the
        // document's — so the handle stays visually above the shape at
        // any rotation.
        const centerLocal = { x: bounds.x + bounds.width / 2, y: bounds.y - ROTATE_HANDLE_OFFSET };
        return toDocumentPoint(centerLocal, selectedTransformable) ?? nDoc;
      })()
    : null;

  return (
    <div className="vector-editor">
      <div className="vector-toolbar">
        <button
          type="button"
          className={`vector-tool${tool === "select" ? " active" : ""}`}
          title="Select (V)"
          onClick={() => setTool("select")}
        >
          ▲
        </button>
        <button
          type="button"
          className={`vector-tool${tool === "rect" ? " active" : ""}`}
          title="Rectangle (R)"
          onClick={() => setTool("rect")}
        >
          ▭
        </button>
        <button
          type="button"
          className={`vector-tool${tool === "ellipse" ? " active" : ""}`}
          title="Ellipse (O)"
          onClick={() => setTool("ellipse")}
        >
          ◯
        </button>
        <span className="vector-toolbar-spacer" />
        <span className={`vector-save-status${dirty ? " unsaved" : ""}`}>{dirty ? "Unsaved" : "Saved"}</span>
        <button type="button" className="vector-save" onClick={() => void save()} title="Save (⌘S)">
          Save
        </button>
        <button
          type="button"
          className={`obsidian-topbar-icon${treeOpen ? " active" : ""}`}
          title="Toggle file explorer"
          onClick={onToggleTree}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M1.5 2.5A1.5 1.5 0 0 1 3 1h4.586a1 1 0 0 1 .707.293l1.414 1.414A1 1 0 0 0 10.414 3.5H13A1.5 1.5 0 0 1 14.5 5v8.5A1.5 1.5 0 0 1 13 15H3A1.5 1.5 0 0 1 1.5 13.5v-11Z"
            />
          </svg>
        </button>
      </div>
      <div className="vector-canvas-scroll">
        <svg
          ref={svgRef}
          className={`vector-canvas${tool !== "select" ? " vector-canvas-drawing" : ""}`}
          width={doc.width}
          height={doc.height}
          viewBox={`0 0 ${doc.width} ${doc.height}`}
          onMouseDown={onCanvasMouseDown}
        >
          <rect x={0} y={0} width={doc.width} height={doc.height} fill={doc.background} />
          {doc.objects.map(renderShape)}
          {draft && renderShape(draft)}
          {selectedTransformable && corners && (
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
                    onMouseDown={(e) => onRotateHandleMouseDown(e, selectedTransformable)}
                  />
                </>
              )}
              {RESIZE_HANDLES.map((handle) => {
                const bounds = localBounds(selectedTransformable);
                const point = toDocumentPoint(handleLocalPoint(bounds, handle), selectedTransformable);
                return (
                  <rect
                    key={handle}
                    x={point.x - 4}
                    y={point.y - 4}
                    width={8}
                    height={8}
                    className={`vector-resize-handle vector-resize-handle-${handle}`}
                    onMouseDown={(e) => onHandleMouseDown(e, selectedTransformable.id, handle)}
                  />
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
