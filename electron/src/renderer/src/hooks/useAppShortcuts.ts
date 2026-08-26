import { useEffect } from "react";
import { Actions, type Model, type TabNode } from "flexlayout-react";
import { closeActivePaneTab } from "../layout/layoutActions";
import { dismissWorkspacePortals } from "../workspacePortalDismiss";
import { onClosePaneTabShortcut } from "../electron";
import type { WorkspaceSettingsTarget } from "./useAppShellState";
import type { PaneGroupConfig } from "../layout/paneTypes";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

function zoomActivePane(model: Model, delta: number): void {
  const tabset = model.getActiveTabset();
  const tabNode = tabset?.getSelectedNode();
  if (!tabNode || tabNode.getType() !== "tab") return;
  const config = ((tabNode as TabNode).getConfig() ?? {}) as PaneGroupConfig;
  const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (config.zoom ?? 1) + delta));
  if (nextZoom === (config.zoom ?? 1)) return;
  model.doAction(
    Actions.updateNodeAttributes(tabNode.getId(), { config: { ...config, zoom: nextZoom } }),
  );
}

type ClosePaneDeps = {
  activeTabId: number;
  getModel: (tabId: number) => Model | undefined;
  bumpLayout: (tabId: number) => void;
  appSettingsOpen: boolean;
  settingsTarget: WorkspaceSettingsTarget | null;
  sidebarQuickSwitchOpen: boolean;
  dismissShellPortals: () => void;
  setSidebarQuickSwitchAnchor: (value: DOMRect | null) => void;
};

export function useAppShortcuts({
  activeTabId,
  getModel,
  bumpLayout,
  appSettingsOpen,
  settingsTarget,
  sidebarQuickSwitchOpen,
  dismissShellPortals,
  setSidebarQuickSwitchAnchor,
}: ClosePaneDeps): void {
  useEffect(
    () =>
      onClosePaneTabShortcut(() => {
        if (appSettingsOpen) {
          dismissShellPortals();
          return;
        }
        if (settingsTarget) {
          dismissShellPortals();
          return;
        }
        if (sidebarQuickSwitchOpen) {
          setSidebarQuickSwitchAnchor(null);
          return;
        }
        const model = getModel(activeTabId);
        if (!model) return;
        if (closeActivePaneTab(model)) bumpLayout(activeTabId);
      }),
    [
      activeTabId,
      bumpLayout,
      appSettingsOpen,
      settingsTarget,
      sidebarQuickSwitchOpen,
      dismissShellPortals,
      setSidebarQuickSwitchAnchor,
      getModel,
    ],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "=" && e.key !== "+" && e.key !== "-" && e.key !== "_") return;
      const model = getModel(activeTabId);
      if (!model) return;
      e.preventDefault();
      const grow = e.key === "=" || e.key === "+";
      zoomActivePane(model, grow ? ZOOM_STEP : -ZOOM_STEP);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId, getModel]);
}

export function useDismissPortalsOnWorkspaceSwitch(
  activeTabId: number,
  dismissShellPortals: () => void,
): void {
  useEffect(() => {
    dismissShellPortals();
    dismissWorkspacePortals();
  }, [activeTabId, dismissShellPortals]);
}
