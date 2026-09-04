import { useEffect } from "react";
import type { TabInfo } from "../electron";
import { onSwitchWorkspaceTabIndexShortcut } from "../electron";
import { switchToTab } from "../components/WorkspaceTabRail";

// StarCraft-style control-group switching: Cmd+1..Cmd+9 jumps straight to
// the Nth workspace tab (1-indexed, left to right). Routed in the main
// process (before-input-event) so a focused terminal cannot swallow Cmd and
// leak bare digits into the shell.
export function useWorkspaceTabHotkeys(tabs: TabInfo[]): void {
  useEffect(
    () =>
      onSwitchWorkspaceTabIndexShortcut(({ index }) => {
        const tab = tabs[index - 1];
        if (!tab) return;
        void switchToTab(tab.id);
      }),
    [tabs],
  );
}
