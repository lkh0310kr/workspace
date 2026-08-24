import { TabInfo } from "../electron";
import { Popover, type AnchorRect } from "./Popover";
import { switchToTab } from "./WorkspaceTabRail";

// Hovering the titlebar's sidebar toggle while the rail is closed shows
// this instead of requiring a click-to-open just to jump to a different
// workspace tab — same row content as WorkspaceTabRail, just as a
// transient popover anchored to the toggle button rather than a
// permanently-open panel. Requested as "Sidebar Toggle 버튼 hover시
// popover selector 표시하여 quick selecting".
interface Props {
  tabs: TabInfo[];
  activeTabId: number;
  anchorRect: AnchorRect;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function SidebarQuickSwitchPopover({
  tabs,
  activeTabId,
  anchorRect,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} className="sidebar-quick-switch-popover">
      <div className="sidebar-quick-switch-list" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`sidebar-quick-switch-row${tab.id === activeTabId ? " active" : ""}`}
            onClick={() => {
              void switchToTab(tab.id);
              onClose();
            }}
            title={tab.root_path}
          >
            <span className="sidebar-quick-switch-title">{tab.title}</span>
            <span className="sidebar-quick-switch-path">
              {tab.root_path.split("/").pop() || tab.root_path}
            </span>
          </button>
        ))}
      </div>
    </Popover>
  );
}
