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
  const [railOpen, setRailOpen] = useState(true);
  const [sidebarQuickSwitchAnchor, setSidebarQuickSwitchAnchor] = useState<DOMRect | null>(null);
  const sidebarHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSidebarHoverTimer = useCallback(() => {
    if (sidebarHoverTimerRef.current) {
      clearTimeout(sidebarHoverTimerRef.current);
      sidebarHoverTimerRef.current = null;
    }
  }, []);

  const scheduleSidebarQuickSwitchClose = useCallback(() => {
    clearSidebarHoverTimer();
    sidebarHoverTimerRef.current = setTimeout(() => setSidebarQuickSwitchAnchor(null), 200);
  }, [clearSidebarHoverTimer]);

  const toggleAppSettings = useCallback((anchor?: DOMRect | null) => {
    setAppSettingsAnchor((open) => {
      if (open) return null;
      return anchor ?? appSettingsButtonRef.current?.getBoundingClientRect() ?? null;
    });
  }, []);

  const dismissPortals = useCallback(() => {
    setAppSettingsAnchor(null);
    setSettingsTarget(null);
    setSidebarQuickSwitchAnchor(null);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleAppSettings();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleAppSettings]);

  useEffect(() => onOpenSettingsShortcut(() => toggleAppSettings()), [toggleAppSettings]);

  return {
    settingsTarget,
    setSettingsTarget,
    appSettingsAnchor,
    setAppSettingsAnchor,
    appSettingsButtonRef,
    themePreference,
    setThemePreference,
    railOpen,
    setRailOpen,
    sidebarQuickSwitchAnchor,
    setSidebarQuickSwitchAnchor,
    sidebarHoverTimerRef,
    clearSidebarHoverTimer,
    scheduleSidebarQuickSwitchClose,
    toggleAppSettings,
    dismissPortals,
  };
}
