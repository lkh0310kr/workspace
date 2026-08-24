import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { TabNode } from "flexlayout-react";
import { PanePicker } from "./PanePicker";
import { SplitIcon } from "./SplitIcon";
import { PaneTabItem, TabKind, tabKindIcon } from "../layout/paneTypes";
import { extractTabToNewPane } from "../layout/layoutActions";
import { popOverlayBlock, pushOverlayBlock } from "../browser/overlayBarrier";
import { startPaneDrag } from "../layout/layoutRef";

// The globalized version of ui/EditorTabBar.tsx (which used to be
// editor-only) — the same tab-chip strip UI now used for every pane kind,
// per the "globalize the editor's multi-tab system so browser [and
// terminal] can use it too" direction. Structural pattern only (Orca's own
// unified-tab-bar concept), not its full machinery (no drag-reorder,
// pinning, quick-command menu, per-worktree scoping — none of that
// applies to this app's single-window personal use).
interface Props {
  tabNode: TabNode;
  items: PaneTabItem[];
  activeTabId: string;
  isDirty: (item: PaneTabItem) => boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: (kind: TabKind) => void;
  onSplit: (mode: "split-right" | "split-down", kind: TabKind) => void;
  /** Called right after a tab chip drag extracted its tab into a new
   * sibling pane (before flexlayout's own drag-and-drop takes over) — the
   * caller needs to bump/persist since that extraction is a direct model
   * mutation outside flexlayout's own dispatch path. */
  onTabExtracted: () => void;
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
  onTabExtracted,
  extraActions,
}: Props) {
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const blockedRef = useRef(false);

  useEffect(() => {
    if (addPickerOpen === blockedRef.current) return;
    blockedRef.current = addPickerOpen;
    if (addPickerOpen) pushOverlayBlock();
    else popOverlayBlock();
  }, [addPickerOpen]);

  useEffect(
    () => () => {
      if (blockedRef.current) popOverlayBlock();
    },
    [],
  );

  const closeAddPicker = useCallback(() => setAddPickerOpen(false), []);
  const activeKind = items.find((i) => i.id === activeTabId)?.kind ?? "terminal";

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
      <div className="pane-tab-strip-tabs">
        {items.map((item) => {
          const dirty = isDirty(item);
          return (
            <div
              key={item.id}
              className={`pane-tab${item.id === activeTabId ? " active" : ""}`}
              // Dragging a chip moves just that tab — extract it into a
              // new sibling pane synchronously, then hand off to
              // flexlayout's own moveTabWithDragAndDrop for the actual
              // drag (reuses its real DnD instead of reimplementing
              // pointer-tracking for our virtual sub-tabs). A single-tab
              // group has nothing to extract — moving it out from under
              // itself is the same as moving the whole pane, so that case
              // falls through to the strip's own whole-pane drag below
              // (stopPropagation isn't called, so the parent's
              // onDragStart still runs).
              draggable
              onDragStart={(e: DragEvent) => {
                if (items.length <= 1) return;
                e.stopPropagation();
                const newNode = extractTabToNewPane(tabNode.getModel(), tabNode.getId(), item.id);
                if (!newNode) return;
                onTabExtracted();
                pushOverlayBlock();
                startPaneDrag(e, newNode);
              }}
              onDragEnd={() => popOverlayBlock()}
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
          );
        })}
        <div className="pane-tab-add-anchor" draggable={false}>
          <button
            type="button"
            className="pane-tab-add"
            title="New tab"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              setAddPickerOpen((open) => !open);
            }}
          >
            +
          </button>
          {addPickerOpen ? (
            <PanePicker
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
