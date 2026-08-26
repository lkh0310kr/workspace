import { useEffect } from "react";
import type { Model } from "flexlayout-react";
import type { TabInfo } from "../electron";
import { countLayoutTabs } from "../layout/layoutModelParse";
import { setActiveLayoutTab, redrawAllLayouts } from "../layout/layoutRef";
import { useWorkspaceStore } from "../store/workspaceStore";

export function useLayoutHostLifecycle(activeTabId: number): void {
  useEffect(() => {
    setActiveLayoutTab(activeTabId);
  }, [activeTabId]);

  useEffect(() => {
    const onResize = () => redrawAllLayouts();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
}

export function useEnsureDefaultTerminals(
  tabs: TabInfo[] | undefined,
  modelEpoch: number,
  ensureTerminal: (tabId: number, model: Model, tabSetId: string) => Promise<void>,
): void {
  useEffect(() => {
    const store = useWorkspaceStore.getState();
    for (const tab of tabs ?? []) {
      const model = store.getModel(tab.id);
      if (!model || countLayoutTabs(model) > 0) continue;
      let tabSetId: string | undefined;
      model.visitNodes((node) => {
        if (!tabSetId && node.getType() === "tabset") {
          tabSetId = node.getId();
        }
      });
      if (tabSetId) {
        void ensureTerminal(tab.id, model, tabSetId);
      }
    }
  }, [modelEpoch, ensureTerminal, tabs]);
}
