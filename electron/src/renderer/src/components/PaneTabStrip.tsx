import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { TabNode } from "flexlayout-react";
import { PanePicker } from "./PanePicker";
import { SplitIcon } from "./SplitIcon";
import { PaneTabItem, TabKind, tabKindIcon } from "../layout/paneTypes";
import { getTabDrag, startTabDrag, endTabDrag, type TabDragPayload } from "../layout/tabDrag";
import { popOverlayBlock, pushOverlayBlock } from "../browser/overlayBarrier";
import { startPaneDrag } from "../layout/layoutRef";

// The globalized version of ui/EditorTabBar.tsx (which used to be
// editor-only) — the same tab-chip strip UI now used for every pane kind,
// per the "globalize the editor's multi-tab system so browser [and
// terminal] can use it too" direction. Structural pattern only (Orca's own
// unified-tab-bar concept — which itself is backed by dnd-kit + a Zustand
// store, not ported), not its full machinery (no pinning, quick-command
// menu, per-worktree scoping). Drag-and-drop reordering (with the
// VSCode/Orca-style vertical insertion-line hint) IS reimplemented here
// with plain native HTML5 drag events — see tabDrag.ts for why a
// module-level variable carries the drag payload instead of
// dataTransfer.getData() (unreadable until drop, but the hint needs to
// update live during dragover).
interface Props {
  tabNode: TabNode;
  items: PaneTabItem[];
  activeTabId: string;
  isDirty: (item: PaneTabItem) => boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: (kind: TabKind) => void;
  onSplit: (mode: "split-right" | "split-down", kind: TabKind) => void;
  /** A tab was dropped into this group at `index` (from this same group or
   * a different one) — caller applies it via moveTabToGroup and persists. */
  onDropTab: (payload: TabDragPayload, index: number) => void;
  extraActions?: ReactNode;
}

function tabLabel(item: PaneTabItem, dirty: boolean): string {
  const base = (() => {
    switch (item.kind) {
      case "terminal":
        return "Terminal";
      case "browser": {
        if (item.title?.trim()) return item.title.trim();
        try {
          return item.url ? new URL(item.url).hostname : "New Tab";
        } catch {
          return item.url || "New Tab";
        }
      }
      case "code":
      case "markdown":
        if (!item.filePath) return "New tab";
        return item.filePath.split("/").pop() || item.filePath;
      default:
        return item.kind;
    }
  })();
  return dirty ? `• ${base}` : base;
}

export function PaneTabStrip({
  tabNode,
  items,
  activeTabId,
  isDirty,
  onSelect,
  onClose,
  onNewTab,
  onSplit,
  onDropTab,
  extraActions,
}: Props) {
  const [addPickerAnchor, setAddPickerAnchor] = useState<DOMRect | null>(null);
  // Index into `items` the dragged tab would land at if dropped right now
  // — null means "not currently being dragged over this strip". Renders
  // as a thin vertical line between chips (or before the first/after the
  // last), matching VSCode/Orca's tab-drag hint.
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const blockedRef = useRef(false);
  const chipRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const open = addPickerAnchor !== null;
    if (open === blockedRef.current) return;
    blockedRef.current = open;
    if (open) pushOverlayBlock();
    else popOverlayBlock();
  }, [addPickerAnchor]);

  useEffect(
    () => () => {
      if (blockedRef.current) popOverlayBlock();
    },
    [],
  );

  // Safety net: if a drag ends anywhere (dropped on a non-strip target,
  // cancelled with Escape, dragged out of the window), clear any indicator
  // this strip might still be showing — its own onDrop/onDragLeave cover
  // the normal cases, but not every way a drag can end fires those on
  // every strip.
  useEffect(() => {
    const onWindowDragEnd = () => setDropIndex(null);
    window.addEventListener("dragend", onWindowDragEnd);
    return () => window.removeEventListener("dragend", onWindowDragEnd);
  }, []);

  const closeAddPicker = useCallback(() => setAddPickerAnchor(null), []);
  const activeKind = items.find((i) => i.id === activeTabId)?.kind ?? "terminal";

  const computeDropIndex = useCallback(
    (clientX: number, draggedTabId: string): number => {
      let index = 0;
      for (const item of items) {
        if (item.id === draggedTabId) continue;
        const rect = chipRefs.current.get(item.id)?.getBoundingClientRect();
        if (!rect) continue;
        if (clientX >= rect.left + rect.width / 2) index++;
        else break;
      }
      return index;
    },
    [items],
  );

  const handleDragOver = (e: DragEvent) => {
    const payload = getTabDrag();
    if (!payload) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndex(computeDropIndex(e.clientX, payload.tabId));
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropIndex(null);
  };

  const handleDrop = (e: DragEvent) => {
    const payload = getTabDrag();
    setDropIndex(null);
    if (!payload) return;
    e.preventDefault();
    onDropTab(payload, computeDropIndex(e.clientX, payload.tabId));
    endTabDrag();
  };

  return (
    <div
      className="pane-tab-strip"
      draggable
      onDragStart={(e: DragEvent) => {
        pushOverlayBlock();
        startPaneDrag(e, tabNode);
      }}
      onDragEnd={() => popOverlayBlock()}
    >
      <div
        className="pane-tab-strip-tabs"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {items.map((item, index) => {
          const dirty = isDirty(item);
          return (
            <div key={item.id} className="pane-tab-slot">
              {dropIndex === index && <div className="pane-tab-drop-indicator" />}
              <div
                ref={(el) => {
                  if (el) chipRefs.current.set(item.id, el);
                  else chipRefs.current.delete(item.id);
                }}
                className={`pane-tab${item.id === activeTabId ? " active" : ""}`}
                draggable
                onDragStart={(e: DragEvent) => {
                  // The strip's own draggable=true (above) is for
                  // repositioning the whole pane — stop that from also
                  // firing when the drag actually starts on a chip.
                  e.stopPropagation();
                  startTabDrag({ sourceTabNodeId: tabNode.getId(), tabId: item.id });
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", item.id);
                }}
                onDragEnd={() => {
                  endTabDrag();
                  setDropIndex(null);
                }}
                onClick={() => onSelect(item.id)}
                title={item.kind === "browser" ? item.url : item.filePath ?? undefined}
              >
                <span className="pane-tab-icon">{tabKindIcon(item.kind)}</span>
                <span className="pane-tab-label">{tabLabel(item, dirty)}</span>
                <button
                  type="button"
                  className="pane-tab-close"
                  title="Close tab"
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(item.id);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
        {dropIndex === items.length && <div className="pane-tab-drop-indicator" />}
        <div className="pane-tab-add-anchor" draggable={false}>
          <button
            type="button"
            className="pane-tab-add"
            title="New tab"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              // Capture the rect now — e.currentTarget is null by the time
              // React invokes this updater (DOM nulls it out once the
              // synchronous dispatch that produced this event finishes),
              // so reading it lazily inside the updater threw
              // "Cannot read properties of null (reading
              // 'getBoundingClientRect')" the moment this button was
              // clicked at all.
              const rect = e.currentTarget.getBoundingClientRect();
              setAddPickerAnchor((prev) => (prev ? null : rect));
            }}
          >
            +
          </button>
          {addPickerAnchor ? (
            <PanePicker
              anchorRect={addPickerAnchor}
              title="New tab"
              onPick={(kind) => {
                onNewTab(kind);
                closeAddPicker();
              }}
              onClose={closeAddPicker}
            />
          ) : null}
        </div>
      </div>
      <div className="pane-tab-strip-actions" draggable={false}>
        {extraActions}
        <button
          type="button"
          className="pane-action pane-action-icon"
          title="Split side by side"
          draggable={false}
          onClick={() => onSplit("split-right", activeKind)}
        >
          <SplitIcon direction="vertical" />
        </button>
        <button
          type="button"
          className="pane-action pane-action-icon"
          title="Split stacked"
          draggable={false}
          onClick={() => onSplit("split-down", activeKind)}
        >
          <SplitIcon direction="horizontal" />
        </button>
      </div>
    </div>
  );
}
