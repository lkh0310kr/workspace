import { TabInfo, addTab, closeTab, selectTab } from "../electron";
import { dismissWorkspacePortals } from "../workspacePortalDismiss";
import {
  beginOptimisticWorkspaceTabSwitch,
  endOptimisticWorkspaceTabSwitch,
} from "../interaction/optimisticWorkspaceTab";
import { syncInteractionCoordinatorWorkspaceTab } from "../interaction/syncInteractionCoordinatorWorkspaceTab";

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
}

export function WorkspaceTabRail({ tabs, activeTabId, onOpenSettings }: Props) {
  return (
    <aside className="workspace-rail">
      <div className="workspace-rail-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`workspace-rail-row ${tab.id === activeTabId ? "active" : ""}`}
          >
            <button
              type="button"
              className="workspace-rail-title"
              onClick={() => void switchToTab(tab.id)}
              title={tab.root_path}
            >
              <span className="workspace-rail-title-text">{tab.title}</span>
              <span className="workspace-rail-title-path">
                {tab.root_path.split("/").pop() || tab.root_path}
              </span>
            </button>
            <button
              type="button"
              className="workspace-rail-settings"
              title="Tab settings"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSettings(tab.id, e.currentTarget.getBoundingClientRect());
              }}
            >
              ⚙
            </button>
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
        ))}
        <button type="button" className="workspace-rail-add" onClick={() => addTab()} title="New tab">
          +
        </button>
      </div>
    </aside>
  );
}
