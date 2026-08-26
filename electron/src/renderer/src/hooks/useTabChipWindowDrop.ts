import { useEffect } from "react";
import { executeTabChipWindowDrop } from "../layout/layoutChipWindowDrop";
import { endTabDrag, getTabDrag } from "../layout/tabDrag";
import { useWorkspaceStore } from "../store/workspaceStore";

export function useTabChipWindowDrop(activeTabId: number): void {
  const bumpLayout = useWorkspaceStore((s) => s.persistLayout);
  const getModel = useWorkspaceStore((s) => s.getModel);
  const setActivePaneTab = useWorkspaceStore((s) => s.setActivePaneTab);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (getTabDrag()) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const payload = getTabDrag();
      if (!payload) return;
      e.preventDefault();
      executeTabChipWindowDrop(activeTabId, e.clientX, e.clientY, payload, {
        getModel,
        bumpLayout: (tabId) => {
          const model = getModel(tabId);
          if (model) bumpLayout(tabId, model);
        },
        setActivePaneTab,
      });
      endTabDrag();
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [activeTabId, bumpLayout, getModel, setActivePaneTab]);
}
