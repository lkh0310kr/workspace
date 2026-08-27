import { useEffect } from "react";
import type { TabInfo } from "../electron";
import { switchToTab } from "../components/WorkspaceTabRail";

// StarCraft-style control-group switching: Cmd+1..Cmd+9 jumps straight to
// the Nth workspace tab (1-indexed, left to right), instead of having to
// open the workspace-switch popover first. Cmd+Shift+digit is left alone
// (Cmd+Shift+F/R are already taken elsewhere) in case a shifted digit
// shortcut is ever wanted for something else.
export function useWorkspaceTabHotkeys(tabs: TabInfo[]): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const tab = tabs[Number(e.key) - 1];
      if (!tab) return;
      e.preventDefault();
      void switchToTab(tab.id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tabs]);
}
