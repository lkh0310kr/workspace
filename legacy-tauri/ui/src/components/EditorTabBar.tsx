export interface EditorTab {
  id: string;
  path: string | null;
}

interface Props {
  tabs: EditorTab[];
  activeTabId: string | null;
  isTabDirty: (tab: EditorTab) => boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

function tabLabel(tab: EditorTab, unsaved: boolean): string {
  if (!tab.path) return unsaved ? "• New tab" : "New tab";
  const name = tab.path.split("/").pop() || tab.path;
  return unsaved ? `• ${name}` : name;
}

export function EditorTabBar({ tabs, activeTabId, isTabDirty, onSelect, onClose, onNewTab }: Props) {
  return (
    <div className="editor-tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`editor-tab${tab.id === activeTabId ? " active" : ""}`}
          onClick={() => onSelect(tab.id)}
        >
          <span className="editor-tab-label">{tabLabel(tab, isTabDirty(tab))}</span>
          <button
            type="button"
            className="editor-tab-close"
            title="Close tab"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="editor-tab-add" onClick={onNewTab} title="New tab">
        +
      </button>
    </div>
  );
}
