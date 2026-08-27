import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { TabInfo, addTab, closeTab, renameTab, reorderTabs, selectTab } from "../electron";
import { dismissWorkspacePortals } from "../workspacePortalDismiss";
import {
  beginOptimisticWorkspaceTabSwitch,
  endOptimisticWorkspaceTabSwitch,
} from "../interaction/optimisticWorkspaceTab";
import { syncInteractionCoordinatorWorkspaceTab } from "../interaction/syncInteractionCoordinatorWorkspaceTab";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { Popover, type AnchorRect } from "./Popover";

// Switching workspace tabs keeps every tab's pane tree mounted — dismiss
// any portaled popovers before the IPC round-trip so invisible layers can't
// block the tab rail, and sync embed pointer-events for the new tab.
export async function switchToTab(tabId: number) {
  dismissWorkspacePortals();
  beginOptimisticWorkspaceTabSwitch(tabId);
  syncInteractionCoordinatorWorkspaceTab("rail-switch-start");
  try {
    await selectTab(tabId);
  } catch (err) {
    console.error(err);
  } finally {
    endOptimisticWorkspaceTabSwitch();
    syncInteractionCoordinatorWorkspaceTab("rail-switch-finally");
  }
}

interface Props {
  tabs: TabInfo[];
  activeTabId: number;
  onOpenSettings: (tabId: number, anchorRect: DOMRect) => void;
  anchorRect: AnchorRect;
  onClose: () => void;
}

export function WorkspaceTabRail({ tabs, activeTabId, onOpenSettings, anchorRect, onClose }: Props) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [contextMenu, setContextMenu] = useState<{ tabId: number; x: number; y: number } | null>(null);
  // Index into `tabs` the dragged row would land at if dropped right now —
  // null means "not currently being dragged over this rail". Same
  // insertion-line pattern as PaneTabStrip's tab drag.
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const draggedIdRef = useRef<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId !== null) inputRef.current?.select();
  }, [renamingId]);

  const startRename = useCallback((tab: TabInfo) => {
    setRenamingId(tab.id);
    setDraft(tab.title);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId === null) return;
    const id = renamingId;
    setRenamingId(null);
    const trimmed = draft.trim();
    const original = tabs.find((t) => t.id === id)?.title;
    if (!trimmed || trimmed === original) return;
    renameTab(id, trimmed).catch(console.error);
  }, [renamingId, draft, tabs]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        {
          type: "button",
          label: "Rename",
          onClick: () => {
            const tab = tabs.find((t) => t.id === contextMenu.tabId);
            if (tab) startRename(tab);
          },
        },
        {
          type: "button",
          label: "Settings…",
          onClick: () => {
            const row = rowRefs.current.get(contextMenu.tabId);
            if (row) onOpenSettings(contextMenu.tabId, row.getBoundingClientRect());
          },
        },
        { type: "separator" },
        {
          type: "button",
          label: "Close Tab",
          disabled: tabs.length <= 1,
          onClick: () => {
            dismissWorkspacePortals();
            closeTab(contextMenu.tabId).catch(console.error);
          },
        },
      ]
    : [];

  const computeDropIndex = useCallback(
    (clientY: number, draggedId: number): number => {
      let index = 0;
      for (const tab of tabs) {
        if (tab.id === draggedId) continue;
        const rect = rowRefs.current.get(tab.id)?.getBoundingClientRect();
        if (!rect) continue;
        if (clientY >= rect.top + rect.height / 2) index++;
        else break;
      }
      return index;
    },
    [tabs],
  );

  const handleDrop = () => {
    const draggedId = draggedIdRef.current;
    setDropIndex(null);
    if (draggedId === null || dropIndex === null) return;
    const withoutDragged = tabs.filter((t) => t.id !== draggedId);
    const insertAt = tabs.findIndex((t) => t.id === draggedId) < dropIndex ? dropIndex - 1 : dropIndex;
    withoutDragged.splice(insertAt, 0, tabs.find((t) => t.id === draggedId)!);
    const orderedIds = withoutDragged.map((t) => t.id);
    reorderTabs(orderedIds).catch(console.error);
  };

  return (
    <Popover anchorRect={anchorRect} onClose={onClose} className="workspace-rail-popover">
    <aside className="workspace-rail">
      <div className="workspace-rail-tabs">
        {tabs.map((tab, index) => (
          <div key={tab.id}>
            {dropIndex === index && <div className="workspace-rail-drop-indicator" />}
            <div
              ref={(el) => {
                if (el) rowRefs.current.set(tab.id, el);
                else rowRefs.current.delete(tab.id);
              }}
              className={`workspace-rail-row ${tab.id === activeTabId ? "active" : ""}`}
              draggable={renamingId !== tab.id}
              onDragStart={(e: DragEvent) => {
                draggedIdRef.current = tab.id;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(tab.id));
              }}
              onDragOver={(e: DragEvent) => {
                if (draggedIdRef.current === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropIndex(computeDropIndex(e.clientY, draggedIdRef.current));
              }}
              onDragEnd={() => {
                draggedIdRef.current = null;
                setDropIndex(null);
              }}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                handleDrop();
              }}
              onContextMenu={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
              }}
            >
              {renamingId === tab.id ? (
                <input
                  ref={inputRef}
                  className="workspace-rail-title-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      inputRef.current?.blur();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setRenamingId(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="workspace-rail-title"
                  onClick={() => {
                    void switchToTab(tab.id);
                    onClose();
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(tab);
                  }}
                  title={tab.root_path}
                >
                  <span className="workspace-rail-title-text">{tab.title}</span>
                  <span className="workspace-rail-title-path">
                    {tab.root_path.split("/").pop() || tab.root_path}
                  </span>
                </button>
              )}
              {tabs.length > 1 ? (
                <button
                  type="button"
                  className="workspace-rail-close"
                  title="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissWorkspacePortals();
                    closeTab(tab.id).catch(console.error);
                  }}
                >
                  ×
                </button>
              ) : (
                <span className="workspace-rail-close-spacer" aria-hidden="true" />
              )}
            </div>
          </div>
        ))}
        {dropIndex === tabs.length && <div className="workspace-rail-drop-indicator" />}
        <button type="button" className="workspace-rail-add" onClick={() => addTab()} title="New tab">
          +
        </button>
      </div>
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={closeContextMenu} />
      )}
    </aside>
    </Popover>
  );
}
