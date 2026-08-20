import { TabInfo, addTab, closeTab, selectTab } from "../tauri";

interface Props {
  tabs: TabInfo[];
  activeTabId: number;
  onOpenSettings: (tabId: number) => void;
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
              onClick={() => selectTab(tab.id)}
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
                onOpenSettings(tab.id);
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
