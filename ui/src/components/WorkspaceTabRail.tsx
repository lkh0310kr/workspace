import { TabInfo, addTab, closeTab, selectTab } from "../tauri";

interface Props {
  tabs: TabInfo[];
  activeTabId: number;
  rootPath: string;
}

export function WorkspaceTabRail({ tabs, activeTabId, rootPath }: Props) {
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
              title={tab.title}
            >
              {tab.title}
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
      <div className="workspace-rail-path" title={rootPath}>
        {rootPath.split("/").pop() || rootPath}
      </div>
    </aside>
  );
}
