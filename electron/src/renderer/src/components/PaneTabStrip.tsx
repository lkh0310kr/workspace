import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import type { TabNode } from "flexlayout-react";
import { ContextMenu } from "./ContextMenu";
import { PanePicker } from "./PanePicker";
import { PaneTabItem, TabKind, TAB_KIND_OPTIONS, tabKindIcon } from "../layout/paneTypes";
import { getTabDrag, startTabDrag, endTabDrag, type TabDragPayload } from "../layout/tabDrag";
import { beginDragOverlay, DRAG_OVERLAY, endDragOverlay } from "../interaction/dragSession";
import { onWorkspaceDismissPortals } from "../workspacePortalDismiss";
import { startPaneDrag, finishPaneDrag } from "../layout/layoutRef";
import { layoutLog } from "../layout/layoutDebugLog";

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
  paneVisible: boolean;
  isDirty: (item: PaneTabItem) => boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: (kind: TabKind) => void;
  onChangeKind: (tabId: string, kind: TabKind) => void;
  /** A tab was dropped into this group at `index` (from this same group or
   * a different one) — caller applies it via moveTabToGroup and persists. */
  onDropTab: (payload: TabDragPayload, index: number) => void;
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
      case "viewer":
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
  paneVisible,
  isDirty,
  onSelect,
  onClose,
  onNewTab,
  onChangeKind,
  onDropTab,
}: Props) {
  const [addPickerAnchor, setAddPickerAnchor] = useState<DOMRect | null>(null);
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  // Index into `items` the dragged tab would land at if dropped right now
  // — null means "not currently being dragged over this strip". Renders
  // as a thin vertical line between chips (or before the first/after the
  // last), matching VSCode/Orca's tab-drag hint.
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const chipRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    closeAddPicker();
    closeContextMenu();
  }, [activeTabId, paneVisible, closeAddPicker, closeContextMenu]);

  useEffect(() => {
    const dismiss = () => {
      closeAddPicker();
      closeContextMenu();
    };
    return onWorkspaceDismissPortals(dismiss);
  }, [closeAddPicker, closeContextMenu]);

  const contextMenuItems = useMemo(() => {
    if (!contextMenu) return [];
    const currentKind = items.find((i) => i.id === contextMenu.tabId)?.kind;
    return [
      {
        type: "button" as const,
        label: "닫기",
        onClick: () => onClose(contextMenu.tabId),
      },
      { type: "separator" as const },
      {
        type: "submenu" as const,
        label: "전환",
        items: TAB_KIND_OPTIONS.map((kind) => ({
          type: "button" as const,
          label: kind.label,
          icon: kind.icon,
          active: kind.id === currentKind,
          onClick: () => onChangeKind(contextMenu.tabId, kind.id),
        })),
      },
    ];
  }, [contextMenu, items, onClose, onChangeKind]);

  const openContextMenu = (e: MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    closeAddPicker();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

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
    const index = computeDropIndex(e.clientX, payload.tabId);
    layoutLog("PaneTabStrip.handleDrop", "tab strip drop", {
      payload,
      index,
      targetPaneNodeId: tabNode.getId(),
    });
    onDropTab(payload, index);
    endTabDrag();
  };

  // Both layers below carry the exact same draggable+onDragStart/onDragEnd
  // for the whole-pane drag — not just the outer .pane-tab-strip. A plain
  // <div draggable> ancestor is *supposed* to still catch a drag started
  // from a non-draggable child per the HTML DnD spec's nearest-draggable-
  // ancestor lookup, but that stopped actually firing here in practice
  // once .pane-tab-strip-tabs (flex:1, no draggable of its own) became the
  // strip's only child and started covering its entire empty background —
  // reported as "pane 옮길 때" doing nothing at all, not even reaching
  // startPaneDrag (confirmed via a temporary console.log that never
  // printed). Attaching the same handlers directly to
  // .pane-tab-strip-tabs too removes the dependency on that ancestor
  // lookup working as expected.
  const shouldIgnorePaneStripDrag = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return true;
    // Tab chips, +/close buttons, and other controls must not start a
    // whole-pane flexlayout drag — it seeds flexlayout's drag overlay and
    // suppresses the click (popover never opens, pane close/add dead).
    return !!el.closest(".pane-tab-slot, .pane-tab-add-anchor, button, a, input, textarea");
  };

  const onStripDragStart = (e: DragEvent) => {
    if (shouldIgnorePaneStripDrag(e.target)) {
      e.preventDefault();
      return;
    }
    layoutLog("PaneTabStrip.onStripDragStart", "pane strip drag start", {
      paneNodeId: tabNode.getId(),
    });
    beginDragOverlay(DRAG_OVERLAY.PANE_TAB_STRIP);
    startPaneDrag(e, tabNode);
  };
  const onStripDragEnd = () => {
    layoutLog("PaneTabStrip.onStripDragEnd", "pane strip drag end", {
      paneNodeId: tabNode.getId(),
    });
    finishPaneDrag();
    endDragOverlay(DRAG_OVERLAY.PANE_TAB_STRIP);
  };

  return (
    <div className="pane-tab-strip" draggable onDragStart={onStripDragStart} onDragEnd={onStripDragEnd}>
      <div
        className="pane-tab-strip-tabs"
        draggable
        onDragStart={onStripDragStart}
        onDragEnd={onStripDragEnd}
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
                onClick={() => {
                  closeAddPicker();
                  closeContextMenu();
                  onSelect(item.id);
                }}
                onContextMenu={(e) => openContextMenu(e, item.id)}
                title={item.kind === "browser" ? item.url : item.filePath ?? undefined}
              >
                <span className="pane-tab-icon">
                  {item.kind === "browser" && item.favicon ? (
                    <img src={item.favicon} className="pane-tab-favicon" alt="" />
                  ) : (
                    tabKindIcon(item.kind)
                  )}
                </span>
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
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      ) : null}
    </div>
  );
}
