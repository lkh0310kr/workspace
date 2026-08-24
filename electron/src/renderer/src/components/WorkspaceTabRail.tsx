import { TabInfo, addTab, closeTab, selectTab } from "../electron";
import { browserHideAll } from "../browser";

// Switching workspace tabs remounts the whole pane tree (App.tsx keys its
// layout host on activeTabId) — any Browser pane in the outgoing tab only
// detaches its native WKWebView asynchronously on unmount (a fire-and-
// forget IPC call, since React's own unmount is synchronous and can't be
// awaited). Native child views always composite *above* the DOM, so
// during that gap a still-attached, no-longer-rendered webview can end up
// sitting invisibly on top of the whole window, swallowing every click
// and drag app-wide until the detach actually lands — reported as
// "tab 전환 했을 때 드래그나 그런 인터렉션이 안됨". Explicitly hiding every
// browser webview *before* asking for the switch (already the same call
// overlayBarrier uses for the analogous splitter/pane-drag case) closes
// that gap instead of leaving it to each pane's own unmount timing.
export async function switchToTab(tabId: number) {
  await browserHideAll().catch(() => {});
  await selectTab(tabId).catch(console.error);
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
