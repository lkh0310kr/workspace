import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemePreference } from "../theme";
import { getStoredThemePreference } from "../theme";
import { onOpenSettingsShortcut } from "../electron";

export type WorkspaceSettingsTarget = { tabId: number; anchorRect: DOMRect };

export function useAppShellState() {
  const [settingsTarget, setSettingsTarget] = useState<WorkspaceSettingsTarget | null>(null);
  const [appSettingsAnchor, setAppSettingsAnchor] = useState<DOMRect | null>(null);
  const appSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  // The workspace-tab list — previously an always-docked sidebar, now a
  // click-toggled popover anchored to the titlebar button, same
  // interaction shape as the app-settings popover below ("왼쪽 사이드바
  // 없애고 그냥 지금 native bar 위에 있는거 클릭하면 보이도록. 설정버튼
  // 처럼").
  const [workspaceRailAnchor, setWorkspaceRailAnchor] = useState<DOMRect | null>(null);
  const workspaceRailButtonRef = useRef<HTMLButtonElement>(null);

  const toggleAppSettings = useCallback((anchor?: DOMRect | null) => {
    setAppSettingsAnchor((open) => {
      if (open) return null;
      return anchor ?? appSettingsButtonRef.current?.getBoundingClientRect() ?? null;
    });
  }, []);

  const toggleWorkspaceRail = useCallback((anchor?: DOMRect | null) => {
    setWorkspaceRailAnchor((open) => {
      if (open) return null;
      return anchor ?? workspaceRailButtonRef.current?.getBoundingClientRect() ?? null;
    });
  }, []);

  const dismissPortals = useCallback(() => {
    setAppSettingsAnchor(null);
    setSettingsTarget(null);
    setWorkspaceRailAnchor(null);
  }, []);

  // Cmd/Ctrl+, is handled in the main process (before-input-event) and relayed
  // via shortcut:open-settings — do not also listen in the renderer or the
  // popover toggles open then immediately closed on one keypress.
  useEffect(() => onOpenSettingsShortcut(() => toggleAppSettings()), [toggleAppSettings]);

  return {
    settingsTarget,
    setSettingsTarget,
    appSettingsAnchor,
    setAppSettingsAnchor,
    appSettingsButtonRef,
    themePreference,
    setThemePreference,
    workspaceRailAnchor,
    setWorkspaceRailAnchor,
    workspaceRailButtonRef,
    toggleWorkspaceRail,
    toggleAppSettings,
    dismissPortals,
  };
}
